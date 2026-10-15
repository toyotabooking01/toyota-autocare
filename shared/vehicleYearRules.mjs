export const VEHICLE_YEAR_FLOOR = 1990
export const latestVehicleYear = (allowNextModelYear = false) => new Date().getUTCFullYear() + (allowNextModelYear ? 1 : 0)
