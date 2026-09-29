"""Each semantic detector fires on its drift variant and stays quiet on baseline.

Profiles are built from the oracle's output, i.e. a pipeline that applied every
rule perfectly. That is the point: the rules are satisfied, the meaning is not.
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from drift_detectors import (build_profile, run_detectors, slash_first_field_gt12,
                             tvd)
from reference_clean import clean

AS_OF = date(2026, 9, 29)


@pytest.fixture(scope="module")
def results(dataset, contract):
    semantic = contract["semantic"]

    def profile(name):
        raw = dataset(name)
        return build_profile(clean(raw), raw, semantic["amount_max_plausible"])

    base = profile("baseline")

    def run(name):
        found = run_detectors(profile(name), base, semantic, AS_OF)
        return {c.id: c for c in found}
    return run


def test_tvd_bounds():
    assert tvd({"a": 0.5, "b": 0.5}, {"a": 0.5, "b": 0.5}) == 0
    assert tvd({"a": 1.0}, {"b": 1.0}) == 1
    assert tvd({"a": 0.6, "b": 0.4}, {"a": 0.4, "b": 0.6}) == pytest.approx(0.2)


def test_slash_share_ignores_non_slash_dates():
    s = slash_first_field_gt12(pd.Series(["13/01/2026", "01/13/2026", "2026-01-13",
                                          "Jan 13 2026", ""]))
    assert s == {"slash_dates": 2, "first_gt12": 1, "share": 0.5}


def test_baseline_is_quiet_except_its_planted_outlier(results):
    found = results("baseline")
    loud = {k: c.status for k, c in found.items() if c.status != "pass"}
    assert loud == {"drift_amount_max": "warn"}
    assert found["drift_amount_max"].evidence["rows_over"] == 1


def test_cents_fires_scale_and_max(results):
    found = results("semantic-dollars-to-cents")
    scale = found["drift_amount_scale"]
    assert scale.status == "fail"
    assert scale.evidence["ratio"] == pytest.approx(100, rel=0.01)
    assert found["drift_amount_max"].evidence["rows_over"] > 20
    assert found["drift_date_ddmm"].status == "pass"
    assert found["drift_country_distribution"].status == "pass"


def test_ddmm_fires_on_input_share_and_future_dates(results):
    found = results("semantic-date-mmdd-to-ddmm")
    ddmm = found["drift_date_ddmm"]
    assert ddmm.status == "fail" and ddmm.evidence["share"] > 0.5
    assert found["drift_future_dates"].status == "warn"
    assert found["drift_future_dates"].evidence["max_order_date"] > "2026-09-29"
    # The month mix moves, but stays under the contract's 0.25 alert: the
    # input-share detector is what catches this variant, not the TVD.
    month = found["drift_month_distribution"].evidence["tvd"]
    assert 0.1 < month < 0.25
    assert found["drift_amount_scale"].status == "pass"


def test_country_swap_fires_country_tvd_only(results):
    found = results("semantic-country-code-swap")
    country = found["drift_country_distribution"]
    assert country.status == "fail" and country.evidence["tvd"] > 0.2
    assert {"AT", "AUSTRIA"} <= set(country.evidence["countries"])
    assert "AU" not in country.evidence["countries"]
    others = {k: c.status for k, c in found.items()
              if k not in {"drift_country_distribution", "drift_amount_max"}}
    assert set(others.values()) == {"pass"}
