#!/usr/bin/env bash
# Evidence screenshot of a Chrome tab: scripts/snap.sh <url-substring> <name>
# Brings the matching tab to the front, captures the page area (no tab/address bars),
# saves observations/evidence/<date>_<name>.png, then hands focus back.
set -euo pipefail
cd "$(dirname "$0")/.."
match="$1"; name="$2"
out="observations/evidence/$(date +%Y-%m-%d)_${name}.png"
osascript <<OSA
tell application "Google Chrome"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t contains "$match" then
        set active tab index of w to i
        set index of w to 1
        activate
        return
      end if
    end repeat
  end repeat
  error "no tab matching $match"
end tell
OSA
sleep 0.8
b=$(osascript -e 'tell application "Google Chrome" to get bounds of front window' | tr -d ' ')
IFS=, read -r x y x2 y2 <<<"$b"
top=136   # tab strip + address bar + "debugging" banner, in points
screencapture -x -R"$x,$((y+top)),$((x2-x)),$((y2-y-top))" "$out"
echo "$out"
