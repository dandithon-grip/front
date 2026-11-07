/** public/assets 아래 Figma 에셋 경로. `npm run fetch-assets` 로 내려받는다. */
export const A = (path: string) => `/assets/${path}`

export const NAV_ICONS = {
  home: { on: 'icons/nav-home-active.svg', off: 'icons/nav-home.svg' },
  route: { on: 'icons/nav-route-active.svg', off: 'icons/nav-route.svg' },
  record: { on: 'icons/nav-record-active.svg', off: 'icons/nav-record.svg' },
  my: { on: 'icons/nav-my-active.svg', off: 'icons/nav-my.svg' },
} as const
