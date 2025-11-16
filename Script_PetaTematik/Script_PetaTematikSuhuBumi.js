// ===============================
// 1. LOAD DATASET MODIS LST + NDVI
// ===============================
var modisLST = ee.ImageCollection("MODIS/061/MOD11A2")
                .filterDate('2025-06-01', '2025-06-30')
                .select(['LST_Day_1km', 'Emis_31', 'Emis_32']);

var modisNDVI = ee.ImageCollection("MODIS/061/MOD13Q1")
                .filterDate('2025-06-01', '2025-06-30')
                .select('NDVI');

// ===============================
// 2. HITUNG RATA-RATA CITRA
// ===============================
var lstMean = modisLST.mean();
var ndviMean = modisNDVI.mean().multiply(0.0001).rename('NDVI');

// Skala LST → Kelvin → Celsius
var LST_K = lstMean.select('LST_Day_1km').multiply(0.02).rename('LST_K');
var LST_C = LST_K.subtract(273.15).rename('LST_C');

// Skala Emissivity
var Emis31 = lstMean.select('Emis_31').multiply(0.002).rename('Emis_31');
var Emis32 = lstMean.select('Emis_32').multiply(0.002).rename('Emis_32');

// ===============================
// 3. HITUNG NDVI_min & NDVI_max DARI DATA SENSOR
// ===============================
var wilayah = ee.FeatureCollection("projects/ee-sekarkinanti519/assets/Kab_PuncakJaya");

var ndviStats = ndviMean.reduceRegion({
  reducer: ee.Reducer.percentile([5,95]),
  geometry: wilayah.geometry(),
  scale: 250,
  bestEffort: true
});

var NDVI_min = ee.Number(ndviStats.get('NDVI_p5'));
var NDVI_max = ee.Number(ndviStats.get('NDVI_p95'));

// Clamp NDVI agar tidak keluar batas
var ndviClamped = ndviMean.clamp(NDVI_min, NDVI_max);

// ===============================
// 4. HITUNG FVC (Fractional Vegetation Cover)
// ===============================
var FVC = ndviClamped.subtract(NDVI_min)
                     .divide(NDVI_max.subtract(NDVI_min))
                     .pow(2)
                     .rename('FVC');

// ===============================
// 5. HITUNG BROADBAND EMISSIVITY (BBE)
//    → Murni berbasis campuran vegetasi–tanah dari NDVI
// ===============================

// Emissivity pure vegetation diambil dari kondisi NDVI tertinggi
var eps_veg = Emis31.where(FVC.lt(0.99), Emis31.multiply(0).add(1)).rename('eps_veg');
eps_veg = ee.Image.constant(0.985);   // nilai dari pengamatan MODIS veg surface (wawancara teknis NASA)

// Emissivity pure soil dari nilai NDVI terendah
var eps_soil = ee.Image.constant(0.94); // nilai tipikal soil broadband (USGS spectral library)

// hitung BBE campuran
var BBE = eps_soil.multiply(ee.Image(1).subtract(FVC))
          .add(eps_veg.multiply(FVC))
          .rename('BBE');

// ===============================
// 6. GABUNGKAN SEMUA KE SATU CITRA
// ===============================
var final = LST_C.addBands([Emis31, Emis32, ndviMean, FVC, BBE]).clip(wilayah);

// ===============================
// 7. TAMPILKAN
// ===============================
Map.centerObject(wilayah, 10);

Map.addLayer(final.select('LST_C'), 
             {min: 15, max: 40, palette: ['blue','green','yellow','red']},
             'LST (°C)');

Map.addLayer(wilayah.style({color:'black', fillColor:'00000000', width: 1}),
             {}, 'Wilayah');

function makeLegendRow(color, label) {
  var colorBox = ui.Label({
    style: {backgroundColor: color, padding: '8px', margin: '4px', width: '20px'}
  });
  var description = ui.Label({value: label, style: {margin: '4px'}});
  return ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
}

// ===============================
// 8. BUAT LEGEND
// ===============================
var legend = ui.Panel({
  style: {position: 'bottom-right', padding: '8px', backgroundColor: 'white'}
});
legend.add(ui.Label({
  value: 'Legenda Suhu Permukaan (°C)',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '4px 0'}
}));

var suhuPalette = ['blue', 'green', 'yellow', 'red'];
var suhuLabels = ['≤ 15 °C', '16 – 25 °C', '26 – 35 °C', '≥ 36 °C'];

for (var i = 0; i < suhuPalette.length; i++) {
  legend.add(makeLegendRow(suhuPalette[i], suhuLabels[i]));
}
Map.add(legend);
// ===============================
// 9. EXPORT CSV
// ===============================
var stats = final.reduceRegions({
  collection: wilayah,
  reducer: ee.Reducer.mean(),
  scale: 1000
});

Export.table.toDrive({
  collection: stats,
  description: 'LST_EmisBBE_CSV',
  folder: 'EarthEngineExports',
  fileFormat: 'CSV'
});
