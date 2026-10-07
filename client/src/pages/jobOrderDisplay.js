export function vehicleName(vehicle) { return vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year} · ${vehicle.plateNumber}` : 'Vehicle record unavailable' }
