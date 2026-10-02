/**
 * Every locator the UI suite uses, in one place.
 *
 * Rhombus puts data-testid attributes on the canvas (it is built on React Flow) and on a
 * few controls. Everything else is found by role or visible text. Two locators depend on
 * CSS classes because the elements have no accessible name or test id; both are marked.
 */
import type { Page } from '@playwright/test';

export const sel = {
  dashboardPath: '/dashboard',
  projectCard: (p: Page) => p.getByTestId('project-card'),

  // Canvas. Node test ids look like "rf__node-input_node_1"; the inner element's id says
  // what kind of node it is ("node-input-selected", "node-llm-unselected", ...).
  canvas: (p: Page) => p.getByTestId('rf__wrapper'),
  nodes: (p: Page) => p.locator('[data-testid^="rf__node-"]'),
  nodeKind: (p: Page) => p.locator('[data-testid^="rf__node-"] [data-testid^="node-"]'),
  // Edge test ids are "rf__edge-xy-<source node id>-<target node id>".
  edges: (p: Page) => p.locator('[data-testid^="rf__edge-"]'),
  runButton: (p: Page) => p.getByTestId('run-pipeline'),

  sidebar: (p: Page) => p.getByTestId('right-sidebar'),
  tab: (p: Page, name: string) => p.getByRole('tab', { name, exact: true }),

  // Data Input panel opens the "Third Party Data" dialog listing connections.
  thirdPartyButton: (p: Page) => sel.sidebar(p).getByRole('button', { name: 'Third Party Sources', exact: true }),
  dialog: (p: Page) => p.getByRole('dialog'),

  // Data Output panel. Each destination is a button named "<provider> <bucket>", next to a
  // "Delete <bucket> destination" button. The selected one contains a filled dot; there is
  // no aria-checked or test id, so that check relies on Rhombus's class names.
  destination: (p: Page, bucket: string) =>
    sel.sidebar(p).getByRole('button', { name: new RegExp(`^Google Cloud Storage ${bucket}$`) }),
  selectedDot: '.rounded-full.bg-primary',
  exportFormat: (p: Page) => sel.sidebar(p).locator('select'),

  // Logs open in a floating panel with no role or test id (class name only).
  logsButton: (p: Page) => p.getByRole('button', { name: /^Logs/ }),
  logsPanel: (p: Page) => p.locator('.workflow-floating-popover'),
  // The first button in the panel is the unlabelled close (X) in its header.
  logsClose: (p: Page) => sel.logsPanel(p).locator('button').first(),

  // Toasts shown when a run ends.
  runSucceededToast: (p: Page) => p.getByText(/^Pipeline completed successfully/),
  runFailedToast: (p: Page) => p.getByText(/^Pipeline failed at/),

  scheduleToggle: (p: Page) => sel.sidebar(p).getByRole('switch', { name: /schedule/i }),
};
