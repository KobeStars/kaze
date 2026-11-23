/**
 * Mode responsive : appareils proposés, partagés entre le principal et l'interface
 * (sans dépendance).
 */

/** Tailles en pixels CSS, comme dans les DevTools de Chrome. */
export const DEVICES = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, dpr: 2, kind: 'mobile', os: 'ios' },
  { id: 'iphone-15', name: 'iPhone 15', width: 393, height: 852, dpr: 3, kind: 'mobile', os: 'ios' },
  { id: 'pixel-8', name: 'Pixel 8', width: 412, height: 915, dpr: 2.625, kind: 'mobile', os: 'android' },
  { id: 'galaxy-s24', name: 'Galaxy S24', width: 360, height: 780, dpr: 3, kind: 'mobile', os: 'android' },
  { id: 'ipad-mini', name: 'iPad mini', width: 768, height: 1024, dpr: 2, kind: 'tablette', os: 'ios' },
  { id: 'ipad-air', name: 'iPad Air', width: 820, height: 1180, dpr: 2, kind: 'tablette', os: 'ios' },
  { id: 'laptop', name: 'Portable', width: 1366, height: 768, dpr: 1, kind: 'ordinateur', os: 'desktop' },
  { id: 'desktop', name: 'Écran Full HD', width: 1920, height: 1080, dpr: 1, kind: 'ordinateur', os: 'desktop' }
] as const
export type Device = (typeof DEVICES)[number]
export type DeviceId = Device['id']
export const DEVICE_IDS = DEVICES.map((d) => d.id) as [DeviceId, ...DeviceId[]]
/** Au-delà, les écrans deviennent trop petits pour être lisibles. */
export const MAX_RESPONSIVE_DEVICES = 4

export function findDevice(id: DeviceId): Device {
  return DEVICES.find((d) => d.id === id) ?? DEVICES[1]
}

/** Taille affichée d'un appareil (largeur et hauteur échangées en paysage). */
export function deviceSize(id: DeviceId, rotated: boolean): { width: number; height: number } {
  const d = findDevice(id)
  return rotated ? { width: d.height, height: d.width } : { width: d.width, height: d.height }
}
