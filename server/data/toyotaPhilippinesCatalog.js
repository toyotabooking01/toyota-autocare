// Initial service catalog. Each row is a Toyota PH trim; model years are explicit.
// Keep future model-year changes here, then run the idempotent catalog seed.
const modelImages = require('./toyotaModelImages');
const models = [
  // Explicit Philippine-market years from Toyota Motor Philippines sources. A null
  // trim means that the year is verified but its exact variant lineup is not.
  // 2020 86: https://content.toyota.com.ph/uploads/pages/38/006_38_1742443635387_000.pdf
  { model: '86', category: 'Sports car', seats: 4, years: [2020], trims: [] },
  // 2017 Toyota product lineup: https://content.toyota.com.ph/uploads/articles/96/003_96_1593398297511_000.pdf
  { model: 'Prius', category: 'Hatchback', seats: 5, years: [2017], trims: [] },
  { model: 'Previa', category: 'MPV', seats: 7, years: [2017], trims: [] },
  // November 2022 Toyota Philippines model lineup:
  // https://content.toyota.com.ph/uploads/pages/22/006_22_1669256073934_000.pdf
  { model: 'Rush', category: 'SUV', seats: 7, years: [2022], trims: [] },
  { model: 'FJ Cruiser', category: 'SUV', seats: 5, years: [2022], trims: [] },
  { model: 'Alphard', category: 'MPV', seats: 7, years: [2022], trims: [] },
  { model: 'Coaster', category: 'Van', seats: 29, years: [2022], trims: [] },
  // Toyota launched the Lite Ace pickup and panel van in 2022.
  // https://www.toyota.com.ph/index.php/news/all-new-toyota-lite-ace-launch
  { model: 'Lite Ace', category: 'Van', seats: 2, years: [2022], trims: [
    ['1.5 Pickup M/T', 'gasoline', 'manual'], ['1.5 Panel Van M/T', 'gasoline', 'manual']] },
  // Toyota launched the Tamaraw in December 2024 for retail in January 2025.
  // https://toyota.com.ph/news/toyota-motor-philippines-rolls-out-next-generation-tamaraw-to-customers
  { model: 'Tamaraw', category: 'Utility', seats: 2, years: [2025], trims: [
    ['2.4 Dropside DSL M/T', 'diesel', 'manual']] },
  { model: 'ATIV', category: 'Sedan', seats: 5, years: [2026], trims: [['1.5 HEV CVT', 'hybrid', 'cvt'], ['1.5 G CVT', 'gasoline', 'cvt'], ['1.3 E CVT', 'gasoline', 'cvt'], ['1.3 E M/T', 'gasoline', 'manual']] },
  { model: 'Corolla Altis', category: 'Sedan', seats: 5, years: [2026], trims: [['1.8 GR-S HEV CVT', 'hybrid', 'cvt'], ['1.8 G HEV CVT', 'hybrid', 'cvt'], ['1.8 E HEV CVT', 'hybrid', 'cvt'], ['1.8 E CVT', 'gasoline', 'cvt']] },
  { model: 'GR 86', category: 'Sports car', seats: 4, years: [2026], trims: [['2.4 A/T', 'gasoline', 'automatic'], ['2.4 M/T', 'gasoline', 'manual']] },
  { model: 'GR Yaris', category: 'Hatchback', seats: 4, years: [2021], trims: [['1.6L Turbo MT', 'gasoline', 'manual']] },
  { model: 'GR Yaris', category: 'Hatchback', seats: 4, years: [2025], trims: [['1.6L Turbo MT', 'gasoline', 'manual'], ['1.6L Turbo A/T', 'gasoline', 'automatic']] },
  // Toyota Motor Philippines: bZ4X launched in 2025; Urban Cruiser BEV arrived in 2026.
  { model: 'bZ4X', category: 'Crossover', seats: 5, years: [2025, 2026], trims: [['AWD BEV', 'electric', 'automatic']] },
  { model: 'Urban Cruiser', category: 'Crossover', seats: 5, years: [2026], trims: [['GLX BEV 2WD', 'electric', 'automatic']] },
  // Philippine historical trims. Keep each set tied to its documented model year.
  // 2003 Corolla LE: Metrobank repossessed vehicle list (2023); XL: Philippine owner listings.
  // https://web-assets.metrobank.com.ph/1723113726-invitation-to-bid.pdf
  // https://philkotse.com/toyota-corolla-year-2003-for-sale-in-metro-manila
  { model: 'Corolla', category: 'Sedan', seats: 5, years: [2003], trims: [['1.3 XL M/T', 'gasoline', 'manual'], ['1.3 LE M/T', 'gasoline', 'manual']] },
  // Toyota Motor Philippines' 2020 price list as recorded in January 2020:
  // https://www.topgear.com.ph/news/industry-news/toyota-2020-price-increase-a4354-20200107
  { model: 'Avanza', category: 'MPV', seats: 7, years: [2020], trims: [['1.3 J MT', 'gasoline', 'manual'], ['1.3 E MT', 'gasoline', 'manual'], ['1.3 E AT', 'gasoline', 'automatic'], ['1.5 G MT', 'gasoline', 'manual'], ['1.5 G AT', 'gasoline', 'automatic'], ['1.5 Veloz AT', 'gasoline', 'automatic']] },
  { model: 'Yaris', category: 'Hatchback', seats: 5, years: [2020], trims: [['1.3 E MT', 'gasoline', 'manual'], ['1.3 E CVT', 'gasoline', 'cvt'], ['1.5 S CVT', 'gasoline', 'cvt']] },
  { model: 'HiAce', category: 'Van', seats: 15, years: [2020], trims: [['2.8 Commuter Deluxe MT', 'diesel', 'manual'], ['2.8 GL Grandia MT', 'diesel', 'manual', 12], ['2.8 GL Grandia AT', 'diesel', 'automatic', 12], ['2.8 GL Grandia Tourer MT', 'diesel', 'manual', 14], ['2.8 GL Grandia Tourer AT', 'diesel', 'automatic', 14], ['2.8 Super Grandia Fabric AT', 'diesel', 'automatic', 10], ['2.8 Super Grandia Leather AT', 'diesel', 'automatic', 10], ['2.8 Super Grandia Elite AT', 'diesel', 'automatic', 10]] },
  { model: 'Hilux', category: 'Pickup', seats: 5, years: [2020], trims: [['2.4 E 4x2 MT', 'diesel', 'manual'], ['2.4 E 4x4 MT', 'diesel', 'manual'], ['2.4 G 4x2 MT', 'diesel', 'manual'], ['2.4 G 4x2 AT', 'diesel', 'automatic'], ['2.8 G 4x4 MT', 'diesel', 'manual'], ['2.8 G 4x4 AT', 'diesel', 'automatic'], ['2.4 Conquest 4x2 MT', 'diesel', 'manual'], ['2.4 Conquest 4x2 AT', 'diesel', 'automatic'], ['2.8 Conquest 4x4 MT', 'diesel', 'manual'], ['2.8 Conquest 4x4 AT', 'diesel', 'automatic']] },
  { model: 'Innova', category: 'MPV', seats: 8, years: [2020], trims: [['2.0 J Gasoline MT', 'gasoline', 'manual'], ['2.0 E Gasoline MT', 'gasoline', 'manual'], ['2.0 E Gasoline AT', 'gasoline', 'automatic'], ['2.0 G Gasoline AT', 'gasoline', 'automatic'], ['2.0 J Diesel MT', 'diesel', 'manual'], ['2.8 E Diesel MT', 'diesel', 'manual'], ['2.8 E Diesel AT', 'diesel', 'automatic'], ['2.8 G Diesel MT', 'diesel', 'manual'], ['2.8 G Diesel AT', 'diesel', 'automatic'], ['2.8 V Diesel AT', 'diesel', 'automatic']] },
  { model: 'Land Cruiser', category: 'SUV', seats: 7, years: [2020], trims: [['200 4.5 AT', 'diesel', 'automatic'], ['200 4.5 Premium AT', 'diesel', 'automatic']] },
  { model: 'Land Cruiser Prado', category: 'SUV', seats: 7, years: [2020], trims: [['4.0 VX Gasoline AT', 'gasoline', 'automatic'], ['3.0 VX Diesel MT', 'diesel', 'manual']] },
  // Toyota T-Sure inventory confirms the individual model years below.
  // https://content.toyota.com.ph/uploads/pages/38/006_38_1740132202356_000.pdf
  // https://content.toyota.com.ph/uploads/pages/38/006_38_1747967856066_000.pdf
  // https://content.toyota.com.ph/uploads/pages/38/006_38_1757067556573_000.pdf
  // Complete 2023 grade/transmission lineups documented at the time:
  // https://www.topgear.com.ph/news/industry-news/toyota-raize-2023-ph-price-increase-a2619-20220830
  // https://www.topgear.com.ph/news/car-news/toyota-innova-vios-ph-price-increase-2023-a4354-20230123
  // https://www.topgear.com.ph/news/industry-news/toyota-philippines-price-list-january-2023-a2619-20230116
  { model: 'Raize', category: 'Crossover', seats: 5, years: [2023], trims: [['1.0 Turbo CVT', 'gasoline', 'cvt'], ['1.2 G CVT', 'gasoline', 'cvt'], ['1.2 E CVT', 'gasoline', 'cvt'], ['1.2 E MT', 'gasoline', 'manual']] },
  { model: 'Vios', category: 'Sedan', seats: 5, years: [2023], trims: [['1.5 GR-S CVT', 'gasoline', 'cvt'], ['1.5 G CVT', 'gasoline', 'cvt'], ['1.5 G MT', 'gasoline', 'manual'], ['1.3 E CVT', 'gasoline', 'cvt'], ['1.3 E MT', 'gasoline', 'manual'], ['1.3 XLE CVT', 'gasoline', 'cvt'], ['1.3 XLE MT', 'gasoline', 'manual'], ['1.3 XE CVT', 'gasoline', 'cvt'], ['1.3 J MT', 'gasoline', 'manual'], ['1.3 Base MT', 'gasoline', 'manual']] },
  { model: 'Fortuner', category: 'SUV', seats: 7, years: [2023], trims: [['2.8 GR-S 4x4 AT', 'diesel', 'automatic'], ['2.8 LTD 4x4 AT', 'diesel', 'automatic'], ['2.8 LTD 4x2 AT', 'diesel', 'automatic'], ['2.8 Q 4x2 AT', 'diesel', 'automatic'], ['2.4 V 4x2 AT', 'diesel', 'automatic'], ['2.4 G 4x2 AT', 'diesel', 'automatic'], ['2.4 G 4x2 MT', 'diesel', 'manual']] },
  { model: 'Hilux', category: 'Pickup', seats: 5, years: [2023], trims: [['2.8 GR-S 4x4 AT', 'diesel', 'automatic'], ['2.8 Conquest 4x4 AT', 'diesel', 'automatic'], ['2.8 Conquest 4x4 MT', 'diesel', 'manual'], ['2.4 Conquest 4x2 AT', 'diesel', 'automatic'], ['2.4 Conquest 4x2 MT', 'diesel', 'manual'], ['2.4 G 4x2 AT', 'diesel', 'automatic'], ['2.4 G 4x2 MT', 'diesel', 'manual'], ['2.4 E 4x2 MT', 'diesel', 'manual'], ['2.4 J 4x4 MT', 'diesel', 'manual'], ['2.4 J 4x2 MT', 'diesel', 'manual']] },
  // Both Wigo generations were sold during 2023. The all-new G/E/J lineup launched in July.
  // https://www.topgear.com.ph/news/car-news/toyota-wigo-2023-prices-a962-20230104
  // https://toyota.com.ph/news/Toyota-Motor-Philippines-to-launch-All-New-Wigo-this-month
  { model: 'Wigo', category: 'Hatchback', seats: 5, years: [2023], trims: [['1.0 E MT', 'gasoline', 'manual'], ['1.0 G MT', 'gasoline', 'manual'], ['1.0 G AT', 'gasoline', 'automatic'], ['1.0 TRD AT', 'gasoline', 'automatic'], ['1.0 G CVT', 'gasoline', 'cvt'], ['1.0 E CVT', 'gasoline', 'cvt'], ['1.0 J MT', 'gasoline', 'manual']] },
  // https://www.topgear.com.ph/news/industry-news/toyota-ph-price-list-may-2024-increases-a2619-20240501
  { model: 'HiAce', category: 'Van', seats: 15, years: [2024], trims: [['2.8 Super Grandia Elite AT', 'diesel', 'automatic', 10], ['2.8 Super Grandia Leather AT', 'diesel', 'automatic', 10], ['2.8 GL Grandia Tourer AT', 'diesel', 'automatic', 14], ['2.8 GL Grandia AT', 'diesel', 'automatic', 12], ['2.8 GL Grandia MT', 'diesel', 'manual', 12], ['2.8 Commuter Deluxe MT', 'diesel', 'manual'], ['3.0 Commuter MT', 'diesel', 'manual'], ['3.0 Ambulance MT', 'diesel', 'manual'], ['3.0 Cargo MT', 'diesel', 'manual']] },
  { model: 'Avanza', category: 'MPV', seats: 7, years: [2025, 2026], trims: [['1.5 G CVT', 'gasoline', 'cvt'], ['1.3 E CVT', 'gasoline', 'cvt'], ['1.3 E MT', 'gasoline', 'manual'], ['1.3 J MT', 'gasoline', 'manual']] },
  { model: 'Wigo', category: 'Hatchback', seats: 5, years: [2025, 2026], trims: [['1.0 G CVT', 'gasoline', 'cvt'], ['1.0 E CVT', 'gasoline', 'cvt'], ['1.0 J MT', 'gasoline', 'manual']] },
  { model: 'Vios', category: 'Sedan', seats: 5, years: [2025, 2026], trims: [['1.3 XLE CVT', 'gasoline', 'cvt'], ['1.3 XLE MT', 'gasoline', 'manual'], ['1.3 XE CVT', 'gasoline', 'cvt'], ['1.3 J MT', 'gasoline', 'manual']] },
  { model: 'Raize', category: 'Crossover', seats: 5, years: [2025, 2026], trims: [['1.0 Turbo CVT', 'gasoline', 'cvt'], ['1.2 G CVT', 'gasoline', 'cvt'], ['1.2 E CVT', 'gasoline', 'cvt'], ['1.2 E MT', 'gasoline', 'manual']] },
  { model: 'Veloz', category: 'MPV', seats: 7, years: [2025, 2026], trims: [['1.5 V CVT', 'gasoline', 'cvt'], ['1.5 G CVT', 'gasoline', 'cvt']] },
  { model: 'Yaris Cross', category: 'Crossover', seats: 5, years: [2025, 2026], trims: [['1.5 S HEV CVT', 'hybrid', 'cvt'], ['1.5 V CVT', 'gasoline', 'cvt'], ['1.5 G CVT', 'gasoline', 'cvt']] },
  { model: 'Corolla Cross', category: 'Crossover', seats: 5, years: [2025, 2026], trims: [['1.8 GR-S HEV CVT', 'hybrid', 'cvt'], ['1.8 V HEV CVT', 'hybrid', 'cvt'], ['1.8 G HEV CVT', 'hybrid', 'cvt']] },
  { model: 'Innova', category: 'MPV', seats: 8, years: [2025, 2026], trims: [['2.8 V DSL AT', 'diesel', 'automatic'], ['2.8 G DSL AT', 'diesel', 'automatic'], ['2.8 G DSL MT', 'diesel', 'manual'], ['2.8 E DSL AT', 'diesel', 'automatic']] },
  { model: 'Zenix', category: 'MPV', seats: 7, years: [2025, 2026], trims: [['2.0 Q HEV CVT', 'hybrid', 'cvt'], ['2.0 V CVT', 'gasoline', 'cvt']] },
  { model: 'Fortuner', category: 'SUV', seats: 7, imageUrl: '/toyota/fortuner.png', years: [2025, 2026], trims: [['2.8 GR-S 4x4 AT', 'diesel', 'automatic'], ['2.8 LTD 4x4 AT', 'diesel', 'automatic'], ['2.8 Q 4x2 AT', 'diesel', 'automatic'], ['2.4 V 4x2 AT', 'diesel', 'automatic'], ['2.4 G 4x2 AT', 'diesel', 'automatic'], ['2.4 G 4x2 MT', 'diesel', 'manual']] },
  { model: 'Hilux', category: 'Pickup', seats: 5, years: [2025, 2026], trims: [['2.8 Conquest 4x4 AT', 'diesel', 'automatic'], ['2.8 G 4x2 AT', 'diesel', 'automatic'], ['2.8 G 4x2 MT', 'diesel', 'manual']] },
  { model: 'Hilux', category: 'Pickup', seats: 5, years: [2026], trims: [['Fleet 2.4 J 4x4 M/T', 'diesel', 'manual']] },
  { model: 'HiAce', category: 'Van', seats: 15, years: [2025, 2026], trims: [['2.8 Commuter Deluxe MT', 'diesel', 'manual'], ['2.8 GL Grandia AT', 'diesel', 'automatic', 12],
    ['2.8 GL Grandia Tourer AT', 'diesel', 'automatic', 14], ['2.8 Super Grandia Elite AT', 'diesel', 'automatic', 10],
    ['2.8 Super Grandia AT', 'diesel', 'automatic', 10]] },
  { model: 'Camry', category: 'Sedan', seats: 5, years: [2025, 2026], trims: [['2.5 V HEV CVT', 'hybrid', 'cvt']] },
  { model: 'RAV4', category: 'SUV', seats: 5, years: [2025, 2026], trims: [['2.5 Limited HEV CVT', 'hybrid', 'cvt'], ['2.5 Adventure HEV CVT', 'hybrid', 'cvt']] },
  { model: 'GR Supra', category: 'Sports car', seats: 2, years: [2025, 2026], trims: [['3.0L AT', 'gasoline', 'automatic'], ['3.0L MT', 'gasoline', 'manual']] },
];

module.exports = models.flatMap(({ model, category, seats, years: supportedYears, trims }) =>
  supportedYears.flatMap(year => (trims.length ? trims : [[null, undefined, undefined]])
    .map(([variant, fuelType, transmission, trimSeats]) => ({
    make: 'Toyota', market: 'Philippines', model, year, variant, category,
    fuelType, transmission, seatingCapacity: trimSeats || seats, imageUrl: modelImages[model],
    modelImageUrl: modelImages[model], isActive: true,
  }))));
