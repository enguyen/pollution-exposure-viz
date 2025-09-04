# Pipeline Migration Guide: Frontend Integration

## Overview
The PM2.5 exposure analysis system has been upgraded from a complex multi-step pipeline to a streamlined unified approach. This document outlines the changes that affect frontend integration and data consumption.

## 🚀 **Major Changes Summary**

### Processing Pipeline
- **Before**: TIFF → person-exposure TIFF → PNG → raw JSON → overlay JSON → compressed JSON (5 steps)
- **After**: TIFF → unified JSON (1 step)
- **Performance**: 3.5x faster processing (5 minutes vs. 17.5 minutes for full dataset)
- **Quality**: Full resolution preserved (601×601 pixels) with smart edge trimming

### Data Structure
- **Before**: Two files per asset (`*_data.json` + `*_raw.json`)
- **After**: Single unified file per asset (`*_data.json`)
- **File Size**: Increased (higher resolution data) but better organized
- **Resolution**: Full 601×601 pixels instead of downsampled versions

---

## 📋 **New Data Format Structure**

### JSON Schema Overview
```json
{
  "asset_id": "1566447",
  "country": "BRA",
  "bounds": {
    "north": -19.246667,
    "south": -21.25,
    "east": -39.233334,
    "west": -41.236668
  },
  "dimensions": {
    "width": 601,
    "height": 601
  },
  "pixel_size": {
    "x": 0.00333333,
    "y": 0.00333333
  },
  "data": {
    "concentration": [[...]],  // 2D array of PM2.5 values (μg/m³)
    "population": [[...]]      // 2D array of population density
  },
  "exposure_analysis": {
    "buckets": {
      "0-12": 234567.8,
      "12-35": 123456.7,
      "35-55": 45678.9,
      // ... more risk buckets
    },
    "total_exposed_population": 987654.3,
    "bucket_metadata": {
      "0-12": {
        "label": "Low Additional Risk (0-12)",
        "color": "#FFF45C",
        "range_ugm3": [0, 12]
      }
      // ... metadata for each bucket
    }
  },
  "stats": {
    "max_concentration": 1140.0,
    "max_population": 5130.0,
    "max_person_exposure": 45200.0,
    "total_person_exposure": 6660000.0
  },
  "processing": {
    "pipeline_version": "unified_v3.0_risk_buckets",
    "precision_digits": 3,
    "preserve_full_resolution": true,
    "crs": "EPSG:4326"
  }
}
```

---

## 🔧 **Frontend Integration Changes**

### File Loading
**Before:**
```javascript
// Two separate files needed
const overlayResponse = await fetch(`overlays/${country}_${assetId}_data.json`);
const rawResponse = await fetch(`raw_data/${country}_${assetId}_raw.json`);
```

**After:**
```javascript
// Single file contains everything
const response = await fetch(`overlays/${country}_${assetId}_data.json`);
const assetData = await response.json();
```

### Data Access Patterns
**Before:**
```javascript
// Separate data sources
const concentration = rawData.data_arrays.concentration;
const population = rawData.data_arrays.population;
const bounds = overlayData.bounds;
```

**After:**
```javascript
// Unified data structure
const concentration = assetData.data.concentration;
const population = assetData.data.population;
const bounds = assetData.bounds;
```

### Exposure Analysis Integration
**New Feature - Pre-calculated Risk Buckets:**
```javascript
// Access WHO-based risk categories
const exposureAnalysis = assetData.exposure_analysis;
const lowRiskPopulation = exposureAnalysis.buckets['0-12'];
const bucketColors = exposureAnalysis.bucket_metadata['0-12'].color;

// Total population exposed to additional PM2.5
const totalExposed = exposureAnalysis.total_exposed_population;
```

### Coordinate System & Resolution
**Key Changes:**
```javascript
// Full resolution - no more downsampling
const width = assetData.dimensions.width;  // Always 601
const height = assetData.dimensions.height; // Always 601

// Pixel size for coordinate calculations
const pixelSizeX = assetData.pixel_size.x;  // ~0.00333 degrees
const pixelSizeY = assetData.pixel_size.y;  // ~0.00333 degrees

// Geographic bounds (may be trimmed from original)
const bounds = assetData.bounds;
```

---

## 📊 **Risk Bucket Integration**

### WHO Health Risk Categories
The new pipeline pre-calculates population exposure in 6 health-based risk categories:

| Range (μg/m³) | Label | Color | Description |
|---------------|-------|--------|-------------|
| 0-12 | Low Additional Risk | #FFF45C | Yellow |
| 12-35 | Elevated Additional Risk | #FFA500 | Orange |
| 35-55 | Significant Additional Risk | #FF6347 | Tomato Red |
| 55-150 | High Additional Risk | #FF0000 | Red |
| 150-250 | Very High Additional Risk | #8B0000 | Dark Red |
| 250+ | Extreme Additional Risk | #800080 | Purple |

### Usage Example
```javascript
function displayExposureAnalysis(assetData) {
  const buckets = assetData.exposure_analysis.buckets;
  const metadata = assetData.exposure_analysis.bucket_metadata;
  
  for (const [range, population] of Object.entries(buckets)) {
    const bucketInfo = metadata[range];
    console.log(`${bucketInfo.label}: ${population.toFixed(0)} people exposed`);
    console.log(`Color: ${bucketInfo.color}`);
  }
}
```

---

## 🔄 **Migration Checklist for Frontend**

### ✅ **Data Loading Updates**
- [ ] Update file paths to use single `overlays/*.json` files
- [ ] Remove `raw_data/*.json` file loading logic
- [ ] Update error handling for new unified file structure
- [ ] Add fallback logic if old format files are still present

### ✅ **Data Structure Updates**
- [ ] Update data access to use `assetData.data.concentration` instead of separate arrays
- [ ] Update bounds access to `assetData.bounds`
- [ ] Update dimension access to `assetData.dimensions`
- [ ] Add support for `assetData.pixel_size` for coordinate calculations

### ✅ **New Features Integration**
- [ ] Implement risk bucket visualization using `exposure_analysis.buckets`
- [ ] Add color mapping using `bucket_metadata[].color` values
- [ ] Display total exposed population from `total_exposed_population`
- [ ] Add pipeline version display from `processing.pipeline_version`

### ✅ **Coordinate & Resolution Updates**
- [ ] Update canvas sizing for full 601×601 resolution
- [ ] Handle edge trimming using processing metadata
- [ ] Verify coordinate system consistency (EPSG:4326)
- [ ] Test pixel-to-coordinate calculations with new pixel sizes

### ✅ **Performance Considerations**
- [ ] Update loading indicators for larger file sizes
- [ ] Implement progressive loading if needed for large datasets
- [ ] Test memory usage with full-resolution arrays
- [ ] Optimize rendering for 601×601 pixel arrays

---

## 🚨 **Breaking Changes & Compatibility**

### Removed Properties
- `data_arrays` → Use `data` instead
- `person_exposure` arrays → Calculate client-side: `concentration[i][j] * population[i][j]`
- Legacy transform properties → Use `bounds` and `pixel_size` for coordinates

### Changed File Organization
- **No more raw_data/ files** - everything is in unified overlays/ files
- **Backup location**: Original files preserved in `overlays_backup_multistep_pipeline_20250904_091424/`

### New Required Handling
- **Edge trimming metadata**: Files may have trimmed dimensions, check `processing.edge_trimming`
- **Pipeline version checking**: Verify `processing.pipeline_version` for compatibility
- **Resolution assumptions**: All files now 601×601, but may be trimmed geographically

---

## 📈 **assets.json Updates**

### New Metadata Structure
```json
{
  "metadata": {
    "pipeline_version": "unified_v3.0_risk_buckets",
    "last_processed": "2025-09-04T09:15:59.524661",
    "overlay_format": "unified_json_with_risk_buckets"
  },
  "assets": [
    {
      "asset_id": "1566447",
      "country": "BRA",
      "overlay_file": "BRA_1566447_data.json",  // New property
      "processing": {
        "pipeline_version": "unified_v3.0_risk_buckets",
        "processed_date": "2025-09-04T09:15:59.524661",
        "processing_time_seconds": 0.096,
        "file_size_mb": 3.53
      }
      // ... other asset properties
    }
  ]
}
```

### Frontend Integration
```javascript
// Check if asset uses new unified format
function isUnifiedFormat(asset) {
  return asset.processing && 
         asset.processing.pipeline_version === 'unified_v3.0_risk_buckets';
}

// Get correct overlay filename
function getOverlayFilename(asset) {
  return asset.overlay_file || `${asset.country}_${asset.asset_id}_data.json`;
}
```

---

## 🧪 **Testing & Validation**

### Data Integrity Verification
```javascript
async function validateAssetData(assetData) {
  // Check required properties exist
  console.assert(assetData.data.concentration, 'Missing concentration array');
  console.assert(assetData.data.population, 'Missing population array');
  console.assert(assetData.exposure_analysis, 'Missing exposure analysis');
  
  // Validate array dimensions
  const height = assetData.dimensions.height;
  const width = assetData.dimensions.width;
  console.assert(assetData.data.concentration.length === height, 'Height mismatch');
  console.assert(assetData.data.concentration[0].length === width, 'Width mismatch');
  
  // Validate risk buckets
  const totalBucketPop = Object.values(assetData.exposure_analysis.buckets)
                              .reduce((a, b) => a + b, 0);
  console.assert(
    Math.abs(totalBucketPop - assetData.exposure_analysis.total_exposed_population) < 1,
    'Population bucket sum mismatch'
  );
}
```

---

## 📞 **Support & Questions**

If you encounter issues during the migration:

1. **Check pipeline version**: Verify `processing.pipeline_version` in the data files
2. **Validate file structure**: Ensure new unified format is properly loaded
3. **Test coordinate calculations**: Verify pixel-to-coordinate transformations
4. **Compare visualizations**: Check that risk buckets display correctly

The unified pipeline represents a major architectural improvement with better performance, higher data quality, and simplified maintenance. The frontend integration should be significantly cleaner with the single unified file format.