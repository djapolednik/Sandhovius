// Hoe een device in de app staat. Een stopcontact met een staande lamp kan
// als lamp worden getoond (shown_as): lamptegel, warme gloed, telt mee als
// lamp, maar zonder helderheid, want het stopcontact kan niet dimmen.
export function displayType(device) {
  return device?.type === 'switch' && device?.shown_as === 'light' ? 'light' : device?.type
}
