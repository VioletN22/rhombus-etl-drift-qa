/**
 * THE one place every UI locator lives.
 * Discovery day: open the app in Playwright codegen (`npx playwright codegen https://rhombusai.com`)
 * or the Inspector, then edit only the TODO lines below. Page objects and specs never
 * hard-code selectors. Prefer role/label/text locators; fall back to data-testid only if needed.
 */
import type { Page, Locator } from '@playwright/test';

type L = (page: Page) => Locator;
type LN = (page: Page, name: string | RegExp) => Locator;

export const sel = {
  // ---------- Auth ----------
  loginPath: '/login', // TODO: confirm actual login route (may be /signin or an auth subdomain)
  loginEmail: ((p) => p.getByLabel(/email/i)) as L, // TODO: confirm label / placeholder
  loginPassword: ((p) => p.getByLabel(/password/i)) as L, // TODO
  loginSubmit: ((p) => p.getByRole('button', { name: /log ?in|sign ?in|continue/i })) as L, // TODO
  signedInMarker: ((p) => p.getByRole('button', { name: /account|profile|avatar/i })) as L, // TODO: something only signed-in users see

  // ---------- Projects ----------
  projectsPath: '/projects', // TODO: confirm dashboard/projects route
  projectLink: ((p, name) => p.getByRole('link', { name })) as LN, // TODO: may be a card (getByRole('article'))

  // ---------- Chat panel ----------
  chatInput: ((p) => p.getByPlaceholder(/ask|message|type/i)) as L, // TODO: exact placeholder
  chatSend: ((p) => p.getByRole('button', { name: /send/i })) as L, // TODO
  chatMessages: ((p) => p.getByRole('log').getByRole('article')) as L, // TODO: message list container + item role
  chatAgentMessages: ((p) => p.getByRole('log').getByRole('article').filter({ hasNot: p.getByText(/^you$/i) })) as L, // TODO: how agent vs user turns differ
  chatBusyIndicator: ((p) => p.getByText(/thinking|generating|working/i)) as L, // TODO: spinner / typing indicator
  /** Response URL fragment for the agent reply (for waitForResponse). TODO: from DevTools Network. */
  chatResponseUrl: /TODO_CHAT_ENDPOINT/,

  // ---------- Canvas ----------
  canvas: ((p) => p.getByRole('application').or(p.locator('.react-flow'))) as L, // TODO: likely React Flow
  canvasNodes: ((p) => p.locator('.react-flow__node')) as L, // TODO: node element
  nodeByName: ((p, name) => p.locator('.react-flow__node').filter({ hasText: name })) as LN, // TODO
  nodeTitle: ((p) => p.locator('.react-flow__node [data-node-title], .react-flow__node')) as L, // TODO: title element within a node
  canvasEdges: ((p) => p.locator('.react-flow__edge')) as L, // TODO
  dataInputLabel: /data input/i, // TODO: confirm label text of the input node
  dataOutputLabel: /data output/i, // TODO
  runPipelineButton: ((p) => p.getByRole('button', { name: /^run( pipeline)?$/i })) as L, // TODO
  nodePreviewButton: ((p) => p.getByRole('button', { name: /preview/i })) as L, // TODO
  previewTable: ((p) => p.getByRole('table')) as L, // TODO: preview grid (may be role=grid)

  // ---------- Third party sources ----------
  sourcesNav: ((p) => p.getByRole('link', { name: /third.party sources|connections/i })) as L, // TODO
  connectionRow: ((p, name) => p.getByRole('row', { name }).or(p.getByRole('listitem').filter({ hasText: name }))) as LN, // TODO
  connectionStatus: ((p, name) => sel.connectionRow(p, name).getByText(/connected|disconnected|error|failed/i)) as LN, // TODO

  // ---------- Output node ----------
  outputDestination: ((p) => p.getByLabel(/bucket|destination|path/i)) as L, // TODO: field in output node config panel
  outputFormat: ((p) => p.getByLabel(/format|file type/i)) as L, // TODO

  // ---------- Schedule ----------
  scheduleNav: ((p) => p.getByRole('tab', { name: /schedule/i }).or(p.getByRole('button', { name: /schedule/i }))) as L, // TODO
  scheduleCron: ((p) => p.getByLabel(/cron/i)) as L, // TODO
  scheduleTimezone: ((p) => p.getByLabel(/time ?zone/i)) as L, // TODO: may be a combobox
  runHistoryNav: ((p) => p.getByRole('tab', { name: /run history|runs|history/i })) as L, // TODO
  runHistoryRows: ((p) => p.getByRole('table').getByRole('row').filter({ hasNot: p.getByRole('columnheader') })) as L, // TODO
  /** Column order of the run-history table. TODO: confirm headers. */
  runHistoryColumns: ['status', 'startedAt', 'duration', 'trigger'] as const,
  runNowButton: ((p) => p.getByRole('button', { name: /run now|trigger/i })) as L, // TODO
};
