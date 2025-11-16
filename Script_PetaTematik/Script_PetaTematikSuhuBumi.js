// === 1. Load dataset MODIS LST ===
var modisLST = ee.ImageCollection("MODIS/061/MOD11A2")
                .filterDate('2025-06-01', '2025-06-30')
                .select(['LST_Day_1km', 'Emis_31', 'Emis_32']);

// === 2. Proses data suhu & emisivitas ===
var lstProcessed = modisLST.mean();

// Skala sesuai dokumentasi MODIS
var lstKelvin = lstProcessed.select('LST_Day_1km').multiply(0.02);
var lstCelsius = lstKelvin.subtract(273.15).rename('LST_C');

var emis31 = lstProcessed.select('Emis_31').multiply(0.002).rename('Emis_31');
var emis32 = lstProcessed.select('Emis_32').multiply(0.002).rename('Emis_32');

// === 3. Hitung Broadband Emissivity (BBE) ===
// Rumus perhitungan Emisivitas Broadband
var bbe = emis31.multiply(0.273)
                .add(emis32.multiply(0.706))
                .subtract(0.013)
                .rename('BBE');

// Gabungkan semua band ke satu citra
var processedImage = lstCelsius.addBands([emis31, emis32, bbe]);

// === 4. Load shapefile wilayah ===
var wilayah = ee.FeatureCollection("projects/lst-mapping-jawa-barat/assets/Kota_Bandung");

// === 5. Potong data ===
var clipped = processedImage.clip(wilayah);

// Mask untuk hanya menampilkan area wilayah
var mask = ee.Image().byte().paint(wilayah, 1);
var maskedData = clipped.updateMask(mask);

// === 6. Visualisasi peta LST ===
Map.centerObject(wilayah, 10);

Map.addLayer(wilayah.style({
  color: 'black',
  fillColor: '00000000',
  width: 1
}), {}, 'Batas Wilayah');

var suhuVis = {
  min: 10,
  max: 40,
  palette: ['blue', 'green', 'yellow', 'red'],
  opacity: 0.8
};

Map.addLayer(maskedData.select('LST_C'), suhuVis, 'Peta Suhu (°C)');

// === 7. Legend suhu ===
function makeLegendRow(color, label) {
  var colorBox = ui.Label({
    style: {backgroundColor: color, padding: '8px', margin: '4px', width: '20px'}
  });
  var description = ui.Label({value: label, style: {margin: '4px'}});
  return ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
}

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

// === 8. Ekspor nilai rata-rata per wilayah ===
var hasil = maskedData.reduceRegions({
  collection: wilayah,
  reducer: ee.Reducer.mean(),
  scale: 1000
});

// === 9. Ekspor CSV ===
Export.table.toDrive({
  collection: hasil,
  description: 'LST_Emis_BBE_KotaBandung',
  folder: 'EarthEngineExports',
  fileFormat: 'CSV'
});
