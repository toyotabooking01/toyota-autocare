export function dateText(value) { return value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : 'Unavailable' }
export function vehicleText(vehicle) { return vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year} · ${vehicle.plateNumber}` : 'Vehicle record unavailable' }
