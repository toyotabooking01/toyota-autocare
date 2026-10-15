import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogVariants, catalogVehicleImages, needsToyotaModelCorrection } from '../src/utils/toyotaCatalog.js'

const items = [
  { _id: 'new', make: 'Toyota', model: 'Fortuner', year: 2025, variant: 'G', imageUrl: '/fortuner-2025.png' },
  { _id: 'older', make: 'Toyota', model: 'Fortuner', year: 2024, variant: 'G', imageUrl: '/fortuner-model.png' },
  { _id: 'empty', make: 'Toyota', model: 'Fortuner', year: 2025, variant: 'V', imageUrl: '' },
  { _id: 'other', make: 'Toyota', model: 'Vios', year: 2025, variant: 'E', imageUrl: '' },
]

test('variant options use only the exact Toyota model and selected year', () => {
  const rows = [
    { make: 'Toyota', model: 'Corolla', year: 2003, variant: '1.3 XL M/T' },
    { make: 'Toyota', model: 'Corolla', year: '2003', variant: '1.3 LE M/T' },
    { make: 'Toyota', model: 'Corolla', year: 2003, variant: '1.3 XL M/T' },
    { make: 'Toyota', model: 'Corolla', year: 2002, variant: '1.3 XE M/T' },
    { make: 'Toyota', model: 'Corolla Altis', year: 2003, variant: '1.6 G A/T' },
    { make: 'Honda', model: 'Corolla', year: 2003, variant: 'Unknown' },
  ]
  assert.deepEqual(catalogVariants(rows, { make: 'Toyota', model: ' TOYOTA corolla ', year: '2003' })
    .map(row => row.variant), ['1.3 LE M/T', '1.3 XL M/T'])
  assert.deepEqual(catalogVariants(rows, { make: 'Toyota', model: 'Corolla', year: 2001 }), [])
})

test('Toyota images prefer the selected model and year, then a model image', () => {
  assert.deepEqual(catalogVehicleImages(items, { model: 'Fortuner', year: 2025, variant: 'G' }),
    ['/toyota/fortuner-cutout.png', '/fortuner-2025.png', '/fortuner-model.png'])
  assert.deepEqual(catalogVehicleImages(items, { model: 'Fortuner', year: 2025 }),
    ['/toyota/fortuner-cutout.png', '/fortuner-2025.png', '/fortuner-model.png'])
  assert.deepEqual(catalogVehicleImages(items, { model: 'Fortuner', year: 2023, catalogEntry: 'new' }),
    ['/toyota/fortuner-cutout.png', '/fortuner-2025.png', '/fortuner-model.png'])
  assert.deepEqual(catalogVehicleImages(items, { model: 'Vios', year: 2023 }), [])
})

test('legacy Toyota records use normalized model and model level fallback', () => {
  const seeded = [
    { make: 'Toyota', model: 'Avanza', year: 2025, variant: '1.5 G CVT', imageUrl: '/toyota/avanza.png' },
    { make: 'Toyota', model: 'Vios', year: 2025, variant: '1.3 XLE CVT', imageUrl: '/toyota/vios.webp' },
  ]
  assert.deepEqual(catalogVehicleImages(seeded, { make: 'Toyota', model: ' TOYOTA avanza ', year: 2020 }), ['/toyota/avanza.png'])
  assert.deepEqual(catalogVehicleImages(seeded, { make: 'toyota', model: 'vios', year: 2023 }), ['/toyota/vios.webp'])
  assert.deepEqual(catalogVehicleImages(seeded, { make: 'Toyota', model: 'AVANZA', year: 2025 }), ['/toyota/avanza.png'])
  assert.deepEqual(catalogVehicleImages(seeded, { make: 'Toyota', model: 'AF86', year: 1986 }), [])
  assert.equal(needsToyotaModelCorrection(seeded, { make: 'Toyota', model: 'AF86', year: 1986 }), true)
  assert.deepEqual(catalogVehicleImages([], { make: 'Toyota', model: 'ATIV', year: 2026 },
    [{ model: 'ATIV', imageUrl: '/toyota/ativ.webp' }]), ['/toyota/ativ.webp'])
  assert.deepEqual(catalogVehicleImages([{ make: 'Toyota', model: 'GR Supra', year: 2025, imageUrl: '/toyota/gr-supra.webp' }],
    { make: 'Toyota', model: 'supra', year: 2025 }), ['/toyota/gr-supra.webp'])
});

test('image order uses exact year, generation, then local model fallback', () => {
  const rows = [
    { make: 'Toyota', model: 'Raize', year: 2023, variant: 'G', imageUrl: '/year.jpg', generationImageUrl: '/generation.jpg' },
    { make: 'Toyota', model: 'Raize', year: 2024, variant: 'G', imageUrl: '/other-year.jpg' },
  ]
  const models = [{ model: 'Raize', modelImageUrl: '/model.jpg' }]
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Toyota', model: 'Raize', year: 2023 }, models),
    ['/year.jpg', '/generation.jpg', '/model.jpg', '/other-year.jpg'])
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Toyota', model: 'Raize', year: 2022 }, models),
    ['/model.jpg', '/other-year.jpg', '/year.jpg'])
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Toyota', model: 'AF86', year: 1986 }, models), [])
})

test('known Toyota submodel names use their parent model image', () => {
  const models = [{ model: 'HiAce', modelImageUrl: '/toyota/hiace.webp' },
    { model: 'Fortuner', modelImageUrl: '/toyota/fortuner.png' },
    { model: 'Hilux', modelImageUrl: '/toyota/hilux.webp' }]
  assert.deepEqual(catalogVehicleImages([], { make: 'Toyota', model: 'Super Grandia', year: 2025 }, models),
    ['/toyota/hiace.webp'])
  assert.deepEqual(catalogVehicleImages([], { make: 'Toyota', model: 'Fortuner GR-S', year: 2025 }, models),
    ['/toyota/fortuner-cutout.png', '/toyota/fortuner.png'])
  assert.deepEqual(catalogVehicleImages([], { make: 'Toyota', model: 'Hilux Fleet', year: 2026 }, models),
    ['/toyota/hilux.webp'])
})

test('Fortuner cutout outranks scenic catalog photos without changing other models', () => {
  const rows = [{ make: 'Toyota', model: 'Fortuner', year: 2026, imageUrl: '/scenic.jpg', generationImageUrl: '/generation.jpg' }]
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Toyota', model: ' TOYOTA FORTUNER ', year: 2026 }),
    ['/toyota/fortuner-cutout.png', '/scenic.jpg', '/generation.jpg'])
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Toyota', model: 'Fortuner', year: '' }), [])
  assert.deepEqual(catalogVehicleImages(rows, { make: 'Honda', model: 'Fortuner', year: 2026 }), [])
  assert.deepEqual(catalogVehicleImages([{ make: 'Toyota', model: 'Vios', year: 2026, imageUrl: '/vios.png' }],
    { make: 'Toyota', model: 'Vios', year: 2026 }), ['/vios.png'])
})
