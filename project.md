# Additional PM2.5 Population Exposure Analysis System

## Project Overview
A web-based system to process and visualize additional PM2.5 concentration data from specific industrial assets paired with population density to calculate and display population-weighted exposure impact. The system emphasizes that each visualization shows the incremental PM2.5 exposure contributed by a specific industrial facility, not total ambient air quality levels.

## Data Structure
- **Input**: Paired GeoTIFF files for each industrial asset
  - Additional PM2.5 concentration raster (μg/m³, time-averaged over 1 year, asset-specific contribution)
  - Population density raster (EU Global Human Settlement Layer)
- **Output**: Interactive web map with clickable assets showing additional exposure impact analysis

## Core Components

### 1. Data Processing Pipeline (`/backend`)
- **GeoTIFF Processor** (`geotiff_processor.py`)
  - Parse paired GeoTIFF files
  - Extract asset centerpoint coordinates
  - Validate spatial alignment between concentration and population rasters
  
- **Exposure Calculator** (`exposure_calculator.py`)
  - Compute population-weighted PM2.5 exposure raster (concentration × population)
  - Calculate total person-exposure (sum of all pixels)
  - Generate exposure statistics and metadata

- **Metadata Manager** (`metadata.py`)
  - Generate JSON index file with all asset metadata
  - Store asset info (ID, country, centerpoint, pixel counts by order of magnitude)
  - Simple file-based storage with fast JSON loading

### 2. Web API (`/api`)
- **Static File Server**
  - Serve `assets.json` index file with all asset metadata
  - Serve pre-computed exposure raster files (PNG/GeoTIFF)
  - Simple HTTP server for processed data files

### 3. Frontend Web Application (`/frontend`)
- **Interactive Map** (`map.js`)
  - Display assets as clickable points (Leaflet/Mapbox)
  - Show asset information on click
  - Overlay exposure raster visualization

- **Asset Details Panel** (`asset-panel.js`)
  - Display asset metadata and exposure statistics
  - Show exposure raster overlay with legend
  - Export capabilities for data/images

## Technical Stack

### Backend
- **Python** with libraries:
  - `rasterio` - GeoTIFF processing
  - `numpy` - Numerical computations
  - `geopandas` - Spatial data handling
  - Simple HTTP server (Python's `http.server` or `Flask` for static files)

### Frontend
- **JavaScript** with:
  - `Leaflet` or `Mapbox GL JS` - Interactive mapping
  - `D3.js` - Data visualization and legends
  - `Bootstrap` - UI components

### Data Storage
- **JSON** file for asset metadata index
- **File system** for organized raster storage
- No database required - simple file-based approach

## File Structure
```
pm25-exposure-analysis/
├── backend/
│   ├── processors/
│   │   ├── geotiff_processor.py
│   │   ├── exposure_calculator.py
│   │   ├── metadata_manager.py
│   │   └── batch_processor.py
│   ├── server.py          # Simple static file server
│   └── config.py
├── frontend/
│   ├── index.html
│   ├── js/
│   │   ├── map.js
│   │   ├── asset-panel.js
│   │   └── utils.js
│   ├── css/
│   │   └── styles.css
│   └── assets/
├── data/
│   ├── input_geotiffs/  # Raw GeoTIFF pairs
│   ├── processed/       # Computed exposure rasters  
│   ├── assets.json      # Master index with metadata and pixel counts
│   └── exports/         # Generated outputs
└── scripts/
    ├── setup.py
    ├── batch_process.py
    └── deploy.sh
```

## Implementation Phases

### Phase 1: Data Processing Core
1. GeoTIFF reading and validation
2. Population-weighted exposure calculation
3. Asset centerpoint extraction
4. Basic file I/O and batch processing

### Phase 2: File-based Data Management
1. JSON metadata structure design
2. File organization and indexing
3. Simple static file server
4. Raster serving capabilities

### Phase 3: Web Interface
1. Basic map with asset points
2. Click interaction and asset details
3. Exposure raster overlay
4. Legend and styling

### Phase 4: Enhancement
1. Performance optimization for large datasets
2. Advanced visualization options
3. Data export functionality
4. Batch upload interface

## Key Considerations

### Performance
- Pre-compute exposure rasters to avoid real-time calculation
- Use raster pyramids/tiles for fast web display
- Implement caching for frequently accessed data

### Scalability  
- JSON index loads quickly for thousands of assets
- File system handles raster storage efficiently  
- Client-side filtering eliminates need for pagination

### Data Validation
- Verify spatial alignment between PM2.5 and population rasters
- Handle missing data and edge cases
- Validate coordinate reference systems

### User Experience
- Fast map loading and interaction
- Clear visualization of exposure levels
- Intuitive asset selection and data display

## Data Quality Assessment

### Concentration Data Issues
**Analysis of 200 concentration files reveals systematic quality concerns:**
- **89.0% (178/200) exhibit suspicious contiguous zero edge patterns**
- **Primary issues:**
  - Right edge stripes: 96 files (48%) - likely model domain truncation
  - Top edge stripes: 88 files (44%) - possible coordinate transformation issues
  - Bottom/left edge stripes: 41 files each (21%) - processing artifacts
- **Impact:** Person-exposure calculations are mathematically correct but limited by concentration data extent

### Population Data Quality
**Population density files show much better data integrity:**
- **Only 20.0% (40/200) have edge pattern issues**
- **Natural data distribution:** 54.1% average zero pixels (expected for population density)
- **Edge patterns are minimal and typically reflect natural population boundaries**

### Recommendations
1. **Flag concentration files** with edge patterns for data provider review
2. **Investigate modeling domain settings** - many plumes appear artificially truncated
3. **Population data is reliable** and suitable for exposure calculations
4. **Person-exposure results valid** but potentially underestimated due to concentration truncation
5. **Implement quality flags** in metadata to identify problematic files

## Data Output Format

### Primary Output: `assets.json`
Single master index file containing all processed assets:

```json
{
  "metadata": {
    "processed_date": "2025-08-29T10:30:00Z",
    "total_assets": 200,
    "countries": ["BRA", "CHN", "COD", "DEU", "IDN", "IND", "IRN", "ITA", "JPN", "KOR", "MYS", "NGA", "NLD", "PAK", "POL", "PRK", "PRY", "RUS", "TCD", "THA", "TWN", "UGA", "UKR", "VNM"],
    "data_version": "v2",
    "script_version": "1.1.0"
  },
  "assets": [
    {
      "asset_id": "1566447",
      "country": "BRA", 
      "center_lon": -40.235001,
      "center_lat": -20.248333,
      "total_pixels": 361201,
      "total_person_exposure": 1984184.0,
      "crs": "EPSG:4326",
      "bounds": {
        "left": -41.236668,
        "bottom": -21.25,
        "right": -39.233334,
        "top": -19.246667
      },
      "concentration_pixel_counts": {
        "0": 3558,
        "0.001-0.01": 28028,
        "0.01-0.1": 127246,
        "0.1-1": 178201,
        "1-10": 22642,
        "10-100": 966,
        "100-1000": 40,
        "1000-10000": 1,
        "10000+": 0
      },
      "population_pixel_counts": {
        "0": 259424,
        "0.001-0.01": 5880,
        "0.01-0.1": 18088,
        "0.1-1": 42284,
        "1-10": 27078,
        "10-100": 3736,
        "100-1000": 2425,
        "1000-10000": 18,
        "10000+": 0
      },
      "person_exposure_pixel_counts": {
        "0": 259471,
        "0.001-0.01": 15843,
        "0.01-0.1": 38180,
        "0.1-1": 30042,
        "1-10": 6208,
        "10-100": 2402,
        "100-1000": 1589,
        "1000-10000": 493,
        "10000+": 9
      },
      "person_exposure_stats": {
        "total_person_exposure": 1984184.0,
        "mean_person_exposure": 5.49,
        "max_person_exposure": 13329.23,
        "min_person_exposure": 0.0,
        "std_person_exposure": 123.34,
        "non_zero_pixels": 101730,
        "non_zero_mean": 19.50
      },
      "script_version": "1.1.0",
      "processed_date": "2025-08-29T14:52:00Z",
      "files": {
        "concentration": "1566447-v2.tiff",
        "population": "1566447-pop-v2.tiff",
        "person_exposure": "BRA_1566447_person_exposure.tiff"
      }
    }
  ]
}
```

### Processing Pipeline Status
**Current Implementation (v1.1.0):**
- ✅ **200 assets processed** across **24 countries**
- ✅ **Person-exposure raster calculation** implemented
- ✅ **GeoTIFF output generation** for all exposure rasters  
- ✅ **Comprehensive statistics** including pixel counts by order of magnitude
- ✅ **Incremental processing** with version tracking
- ✅ **Batch processing** with automatic file discovery
- ✅ **Data quality assessment** completed

**Output Files Generated:**
- `assets.json` - 12,635 lines of metadata for all assets
- `processed/` - 200 person-exposure GeoTIFF files (1.4MB each)
- `edge_pattern_analysis_complete.json` - Detailed quality assessment results

### Alternative Formats
- **CSV Export**: For statistical analysis and external tools
- **Individual JSON files**: For very large datasets requiring partitioning

## Web Application Improvements & Fixes (Latest Version)

### Major Enhancement: Circle-Based Visualization
**Implemented best practices for pollution exposure mapping:**
- **Circle color represents additional PM2.5 concentration levels** (Low to Extreme Additional Risk, 0-250+ μg/m³)
- **Circle size represents population exposed** (graduated symbols from 0-100 to 10K+ people)
- **Replaced raster overlays** with more intuitive point-based visualization
- **Real-time rendering** using HTML5 Canvas with proper coordinate transformation

### Map & UI Improvements
**Base Map Styling:**
- **Minimal CartoDB Positron tiles** replace detailed OpenStreetMap for better data visibility
- **Clean, light background** reduces visual competition with PM2.5 data
- **Major roads preserved** for geographic orientation

**Responsive Legend System:**
- **Adaptive circle sizes** that reflect actual rendered sizes at current zoom level
- **Zoom level indicator** shows "at zoom X" for scale reference
- **Space-efficient semicircles** (right-half display) save horizontal space
- **Dynamic asset ID display** in legend title ("Additional PM2.5 Exposure from CHN_1566560")

### Technical Architecture Fixes
**Coordinate System Corrections:**
- **Fixed overlay drift issue** by switching from `latLngToContainerPoint()` to `latLngToLayerPoint()`
- **Proper canvas positioning** within Leaflet's overlay pane
- **Eliminated 2x coordinate drift** during map panning and zooming

**Loading & Error Resilience:**
- **Robust asset loading** with automatic retry mechanism (up to 3 attempts with 2s delay)
- **Loading state management** with visual spinner indicators
- **Graceful fallback** from new overlay format to legacy raw data files
- **Smart waiting system** for URL-based asset jumping with 10s timeout

**Data Loading Architecture:**
- **Dual overlay system** supporting both new overlay data format and legacy raw data
- **Automatic filename construction** (`${country}_${asset_id}_data.json` and `_raw.json`)
- **Error handling** with user-friendly messages and manual retry options

### Language & Terminology Updates
**Asset-Specific Clarity:**
- **"Additional" terminology** throughout interface emphasizes incremental impact
- **Asset ID integration** in all tooltips, legends, and panel titles
- **Risk-based classification** ("Low Additional Risk" to "Extreme Additional Risk")

**Updated UI Labels:**
- Browser title: "Additional PM2.5 Exposure Analysis"
- Legend: "Additional PM2.5 Exposure from [ASSET_ID]"
- Tooltips: "Asset CHN_1566560 exposes X people to additional Y μg/m³"
- Stats panel: "Total Additional Person-Exposure", "Peak Additional Exposure"

### Performance & Code Quality
**Console Output Management:**
- **Removed debug logging** for production-ready experience
- **Error-only logging** for troubleshooting while maintaining clean console
- **Eliminated test function calls** and Z-index debugging

**Color & Visual Fixes:**
- **Robust hex color parsing** supporting both 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) formats
- **Fallback color handling** prevents application crashes on invalid colors
- **Improved color scheme** with better contrast against light background

### Data Visualization Features
**Interactive Elements:**
- **Asset markers** sized by person-exposure percentiles (XS to XL sizing)
- **Hover tooltips** with comprehensive exposure information
- **Click interactions** for detailed asset analysis
- **Real-time legend updates** on zoom changes

**Statistical Display:**
- **Pixel count distributions** for concentration, population, and person-exposure
- **Coverage area calculations** in kilometers
- **Processing metadata** with timestamps and version tracking
- **Asset location coordinates** with 4-decimal precision

### Current Implementation Status
**✅ Completed Features:**
- Circle-based visualization with proper sizing and coloring
- Adaptive legend with zoom-level awareness
- Minimal base map styling for optimal data visibility
- Comprehensive error handling and loading states
- Asset-specific language throughout interface
- Coordinate system fixes eliminating overlay drift
- Robust data loading with fallback mechanisms
- Performance optimization with reduced console output

**🔧 Technical Architecture:**
- HTML5 Canvas rendering for efficient circle display
- Leaflet.js with custom overlay classes
- Bootstrap UI components for responsive design
- D3.js for data processing and statistics
- File-based data serving (JSON + raw data files)

## Proposed Feature: Multi-Asset Point Analysis

### **Overview**
A new feature allowing users to click on any point on the map (not on an asset marker) to see cumulative PM2.5 exposure from all nearby contributing assets at that specific location.

### **User Interface Design**
**Click anywhere on map → Side panel shows:**
```
📍 Point Analysis: [lat, lng]

🔢 Total Additional PM2.5: 45.2 μg/m³
🏭 Contributing Assets: 8 of 23 nearby

[Bar Chart Visualization]
████████████ CHN_1566560: 18.5 μg/m³
██████████   IND_892341:  12.3 μg/m³ 
██████       DEU_445521:   8.7 μg/m³
███          BRA_778234:   3.2 μg/m³
██           RUS_334455:   2.5 μg/m³

[Distance/Direction Info]
CHN_1566560: 12.4 km NE
IND_892341:  8.7 km SW
...
```

### **Critical Design Decision: No Percentages**
**⚠️ Important:** Do not display percentage values in the bar chart or analysis. Percentages would incorrectly imply that these assets represent 100% of PM2.5 exposure at that location. These are only the **additional** exposure contributions from the specific modeled assets - there are many other sources of PM2.5 not included in this analysis (traffic, residential heating, natural sources, etc.).

### **Implementation Steps**

#### **Phase 1: Basic Infrastructure**
1. **Click Handler Setup**
   - Add map click event listener that differentiates between asset markers and empty map areas
   - Capture clicked lat/lng coordinates
   - Show loading state in sidebar

2. **Spatial Search Algorithm**
   - Implement 100km radius search around clicked point
   - Use simple distance calculation: `Math.sqrt((lat2-lat1)² + (lon2-lon1)²) * 111km`
   - Filter assets within radius from main `assetsData.assets` array

#### **Phase 2: Grid Overlap Detection**
3. **Grid Intersection Logic**
   - For each nearby asset, determine if clicked point falls within its bounds
   - Calculate which grid cell the clicked point corresponds to in each asset's coordinate system
   - Handle coordinate system misalignment with interpolation if needed

4. **Data Extraction**
   - Load raw data files for assets with grid overlaps: `fetch('raw_data/${country}_${asset_id}_raw.json')`
   - Extract PM2.5 concentration value at the specific grid cell
   - Filter out assets with 0 contribution at that point

#### **Phase 3: UI Components**
5. **Side Panel Layout**
   - Replace asset details with point analysis view
   - Show total cumulative PM2.5 increase
   - Display count of contributing vs. total nearby assets
   - Include clicked coordinates for reference

6. **Bar Chart Implementation**
   - Horizontal bars with asset colors (using existing `countryColors`)
   - Show only absolute values in μg/m³ (no percentages)
   - Sort by contribution level (highest first)
   - Include asset ID, distance, and direction from clicked point

#### **Phase 4: Performance Optimizations (Future)**
7. **Spatial Indexing**
   - Implement R-tree or similar spatial index for asset bounds
   - Pre-calculate asset coverage areas for faster intersection tests

8. **Data Caching**
   - Cache loaded raw data files in memory
   - Implement LRU cache with size limits for browser memory management

9. **Grid Alignment Optimization**
   - Pre-process and align all asset grids to a common coordinate system
   - Use optimized interpolation algorithms for misaligned grids

### **Technical Considerations**

#### **Data Flow**
```
Click Event → Spatial Search → Grid Intersection → Data Loading → 
Contribution Calculation → UI Update
```

#### **Error Handling**
- Handle missing raw data files gracefully
- Show partial results if some assets fail to load
- Display "No significant contribution" message for zero-contribution points

#### **User Experience**
- Show loading spinner during calculation
- Update URL with clicked coordinates for sharing
- Add "Clear Analysis" button to return to normal view
- Highlight contributing assets on map with connection lines

#### **Scalability for Future**
- Current approach works for hundreds of assets
- For tens of thousands of assets: need spatial database, server-side processing, or WebWorker threading
- Consider asset importance weighting to limit analysis to most significant contributors

### **MVP Implementation Priority**
1. Basic click detection and coordinate capture
2. Simple distance-based asset filtering  
3. Grid intersection for 2-3 test assets
4. Basic bar chart with absolute values only
5. Real data integration and contribution calculation
6. Polish UI and add geographic context

This feature will provide powerful analytical capabilities for understanding cumulative exposure impacts while maintaining clarity that these represent additional contributions from specific modeled assets, not total ambient PM2.5 levels.

## Multi-Asset Point Analysis - Implementation Status

### **✅ Currently Implemented (Functional)**

#### **Core Functionality**
- **Single-point analysis system**: Click anywhere on map to analyze cumulative PM2.5 exposure from nearby assets
- **100km spatial search**: Automatically finds assets within search radius using distance calculation
- **Grid intersection detection**: Determines which assets have coverage at clicked location
- **Raw data integration**: Loads and processes 2D concentration/population arrays from `raw_data/` files
- **Zero-contribution filtering**: Excludes assets with no impact at analysis point

#### **User Interface**
- **Real-time sidebar updates**: Shows analysis progress, results, and error states
- **Comprehensive results panel**: Displays total additional PM2.5 and contributing asset count
- **Horizontal bar chart**: Absolute concentration values (μg/m³) with no misleading percentages
- **Asset details**: Distance, direction (N/NE/E/etc.), and local population data for each contributor
- **Clean exit mechanism**: "Exit Point Analysis Mode" button returns to normal view

#### **Visual Layer System**
- **PointAnalysisLayer class**: Canvas-based overlay for visual feedback with drop shadows
- **Enhanced crosshair reticle**: Larger, more visible red crosshair (30px size) with drop shadows
- **Animated connection lines**: Concentration-colored dotted lines from contributing assets to analysis point
- **Concentration-based colors**: Lines use PM2.5 risk level colors (Yellow→Orange→Red→Purple scheme)
- **Improved line thickness**: Enhanced scaling (3-25px range) with logarithmic concentration mapping
- **Professional drop shadows**: Both reticle and lines have subtle shadows for better visibility over any background
- **Stable coordinate system**: Uses `latLngToLayerPoint()` for consistent positioning without drift

#### **Color Integration System**
- **Unified color scheme**: Both sidebar bar charts and connection lines use identical concentration-based colors
- **Risk-based color mapping**: 
  - Low Risk (0-12 μg/m³): Yellow (#FFF45C)
  - Elevated Risk (12-35 μg/m³): Orange (#FFA500)  
  - Significant Risk (35-55 μg/m³): Tomato Red (#FF6347)
  - High Risk (55-150 μg/m³): Red (#FF0000)
  - Very High Risk (150-250 μg/m³): Dark Red (#8B0000)
  - Extreme Risk (250+ μg/m³): Purple (#800080)
- **Global color function**: `getConcentrationColor()` available across all modules

#### **Technical Architecture**
- **Single active analysis**: New point clicks automatically clear previous analysis
- **Robust layer management**: Enhanced cleanup prevents multiple overlapping layers
- **Data caching system**: `loadedAssetData` Map improves performance for repeated asset queries
- **Error handling**: Graceful fallbacks for missing data, network issues, and invalid coordinates
- **High z-index rendering**: Point analysis layer (z-index: 1100) appears above all other overlays

### **✅ Recent Improvements Completed**

#### **Visual Enhancement (December 2024)**
- **Fixed coordinate system drift**: Resolved 2x movement issue during map panning
- **Implemented concentration-based color coding**: Replaced country colors with PM2.5 risk level colors
- **Added professional drop shadows**: Enhanced visibility of reticle and connection lines
- **Improved line scaling**: Better visual representation of concentration differences
- **Unified color scheme**: Consistent colors between sidebar charts and visual connections

#### **Coordinate System Resolution**
- **Stable positioning**: Canvas uses proper `latLngToLayerPoint()` coordinate system
- **No more drift**: Visual elements remain fixed to geographic coordinates during map interactions
- **Consistent rendering**: Reliable canvas positioning at overlay pane coordinates (0,0)

### **🔄 Remaining Development Opportunities**

#### **UI/UX Enhancements**
- **Mode indication**: Visual indicator when in point analysis mode vs. normal mode
- **Loading state refinement**: Progressive feedback during multi-step analysis
- **Keyboard shortcuts**: Escape key to exit point analysis mode
- **Mobile responsiveness**: Touch interactions optimization for point analysis

#### **Advanced Features**
1. **Multi-point comparison**: Analyze multiple points simultaneously for comparative studies
2. **Export capabilities**: Save point analysis results as images, CSV, or JSON data files
3. **Historical analysis**: Time-series analysis at specific geographic coordinates
4. **Advanced filtering**: Limit analysis by asset type, country, or concentration thresholds
5. **Batch analysis**: Upload coordinate lists for automated analysis of multiple locations

#### **Performance Optimizations**
- **Spatial indexing**: Improve nearby asset search performance for large datasets
- **Progressive loading**: Load and analyze assets incrementally for better user experience
- **Web worker integration**: Move heavy calculations to background threads

The point analysis feature provides a powerful new way to understand cumulative PM2.5 impacts while maintaining scientific accuracy about the additional (not total) nature of the modeled exposures.

---

## **Current Data Processing Pipeline**

### **Active Directories:**
1. **`input_geotiffs/`** - Source TIFF files organized by country (concentration + population)
2. **`raw_data/`** - Extracted JSON pixel arrays (`*_raw.json` files)  
3. **`overlays/`** - Optimized visualization data (`*_data.json` files)
4. **`frontend/`** - Web application and JavaScript modules

### **Processing Flow:**
```
input_geotiffs/{country}/{asset}-v2.tiff
input_geotiffs/{country}/{asset}-pop-v2.tiff
                    ↓ (export_raw_data.py)
raw_data/{country}_{asset}_raw.json
                    ↓ (create_overlay_data.py)  
overlays/{country}_{asset}_data.json
                    ↓ (frontend/js/map.js)
Canvas visualization in browser
```

### **🗑️ Legacy/Unused Directories:**
- **`processed/`** - Contains person-exposure TIFF files, no longer used in current pipeline
  - Was used for PNG overlay generation (deprecated approach)
  - Person-exposure calculation now handled client-side from concentration + population data
  - **Status**: Can be safely removed or archived

### **Key Scripts (Active Pipeline):**

#### **Data Extraction & Processing:**
- **`export_raw_data.py`** - Primary data extraction script
  - Reads TIFF rasters using GDAL/rasterio
  - Extracts concentration and population pixel arrays 
  - Outputs structured JSON with geographic bounds and pixel data
  - Handles coordinate transformations and nodata filtering
  - ~200 assets processed across 24 countries

- **`create_overlay_data.py`** - Optimization for web visualization  
  - Converts raw pixel arrays to web-optimized format
  - Removes zero-value pixels to reduce file sizes
  - Structures data for efficient Canvas rendering
  - Adds metadata for proper geographic positioning

- **`reduce_precision.py`** - Data size optimization for GitHub compatibility
  - Reduces floating-point precision to 2-3 significant digits using logarithmic rounding
  - Achieved 70% file size reduction (290MB → 86MB) while preserving data quality
  - Processes all overlay JSON files with configurable precision levels
  - Essential for repository size constraints and web performance
  - Example: 0.026884429156780243 → 0.027 (2 sig digits)
  - **IMPORTANT**: Preserves geographic bounds at 6 decimal places to maintain spatial extent

- **`fix_bounds.py`** - Emergency fix for precision-induced bounds collapse
  - Restores original precision bounds from raw data files
  - Fixed 118 assets where east==west or north==south coordinates after precision reduction
  - One-time script to resolve critical rendering bug caused by zero-width canvases

- **`geotiff_processor.py`** - Core geospatial utilities
  - GDAL wrapper functions for raster operations
  - Coordinate system transformations (WGS84, Web Mercator)
  - Pixel-to-geographic coordinate mapping
  - Shared utilities across all processing scripts

#### **Web Application (Frontend):**
- **`frontend/js/map.js`** (2,500+ lines) - Core application logic
  - Leaflet map initialization and base layer management
  - Asset marker rendering with population-based sizing
  - Canvas overlay system for concentration visualization  
  - Point analysis mode with spatial search algorithms
  - Data loading, caching, and error handling
  - Risk-based color classification and legend generation

- **`frontend/js/point-analysis-layer.js`** (220+ lines) - Visual feedback system
  - HTML5 Canvas-based overlay for point analysis visualization
  - Crosshair reticle rendering with drop shadows
  - Animated connection lines between assets and analysis points
  - Concentration-based color coding and line thickness scaling
  - Stable coordinate system handling to prevent drift

- **`frontend/js/asset-panel.js`** (180+ lines) - Sidebar interface
  - Asset information display and formatting
  - Statistical summaries and data visualization
  - Point analysis results presentation with bar charts
  - Interactive elements and mode switching

#### **Development & Testing Scripts:**
- **`server.py`** - Local development server with CORS handling
- **`exposure_stats_viewer.py`** - Data quality analysis and statistics
- **`edge_pattern_analyzer.py`** - Detects artifacts in concentration data
- **`test_overlay.py`** - Validation of data processing pipeline

#### **🗂️ Legacy Scripts (Deprecated but Preserved):**
- **`generate_all_overlays.py`** - Multi-threaded PNG overlay generation (old approach)
- **`raster_overlay.py`** - PNG-based visualization pipeline (superseded by JSON approach)  
- **`generate_uniform_overlays.py`** - Alternative overlay approach for testing
- **`test_canvas_layout.js`** - Canvas positioning tests during coordinate system debugging

---

## **Technical Implementation Details**

### **Data Format Evolution:**
The project has evolved through three distinct visualization approaches:

1. **PNG Overlay Phase** (deprecated)
   - Generated static PNG images from TIFF rasters
   - Required server-side processing for each zoom level
   - Large file sizes and inflexible visualization options

2. **Raw JSON Phase** (intermediate)
   - Direct extraction of pixel arrays to JSON
   - Included all pixels (including zeros) resulting in large files
   - Enabled client-side rendering but with performance issues

3. **Optimized Overlay Phase** (current)
   - Compressed JSON with zero-value pixels removed
   - Structured for efficient Canvas rendering
   - ~70% file size reduction compared to raw JSON
   - Real-time client-side person-exposure calculations

### **Performance Optimizations:**

#### **Data Loading:**
- **Lazy loading**: Assets loaded on-demand when selected
- **Caching system**: `loadedAssetData` Map prevents duplicate requests  
- **Graceful fallback**: Automatic retry mechanism for network failures
- **Error boundaries**: Robust error handling prevents application crashes

#### **Rendering Performance:**
- **Canvas-based rendering**: Hardware-accelerated graphics for large datasets
- **Graduated symbol scaling**: Circle areas computed using square root scaling for perceptual accuracy
- **Z-index management**: Layered rendering system prevents visual conflicts
- **Animation optimization**: RequestAnimationFrame for smooth 60fps animations

#### **Spatial Analysis:**
- **100km search radius**: Configurable distance-based asset filtering
- **Haversine distance**: Great-circle distance calculations for geographic accuracy
- **Grid intersection**: Efficient pixel-level data extraction at analysis points
- **Concurrent processing**: Parallel asset analysis for improved response times

### **Color Science & Accessibility:**

#### **Risk-Based Color Progression:**
- **Sequential color scheme**: Yellow → Orange → Red → Purple progression
- **Health-context colors**: Colors intuitively represent increasing health risk
- **Perceptually uniform**: Color differences represent meaningful concentration differences  
- **High contrast ratios**: Ensures accessibility for color vision differences

#### **Concentration Classification:**
- **Manual breaks**: Health-based thresholds rather than statistical quantiles
- **WHO guidelines alignment**: Risk categories reflect established health impact research
- **No safe threshold principle**: Acknowledges that any additional PM2.5 carries health risk
- **Linear risk scaling**: Color intensity correlates with documented health impact severity

### **Coordinate System Precision:**

#### **Geographic Accuracy:**
- **WGS84 geographic coordinates**: Standard lat/lng coordinate system for global compatibility
- **Layer point transformations**: `latLngToLayerPoint()` for stable overlay positioning
- **Pixel-perfect alignment**: Eliminates coordinate drift during map interactions
- **Multi-zoom consistency**: Overlays maintain accuracy across all zoom levels

#### **Canvas Positioning:**
- **Overlay pane integration**: Proper layer stacking within Leaflet's pane system
- **Dynamic canvas sizing**: Responsive to map viewport changes and device scaling  
- **High-DPI support**: Automatic scaling for retina and high-resolution displays
- **Memory efficient**: Canvas resources properly managed and garbage collected

## Critical Bug: Precision Reduction Breaking Overlay Rendering

### **Bug Description:**
During optimization for GitHub repository size constraints, precision reduction of overlay data inadvertently collapsed geographic bounds for 118 assets, causing complete failure of overlay visualization.

### **Root Cause:**
The `reduce_precision.py` script reduced all floating-point numbers to 2 significant digits, including geographic boundary coordinates. For assets with small geographic extents, this caused east and west coordinates to round to identical values.

**Example:**
- **Original bounds**: `east: 119.4766686479561, west: 117.47333526611328`
- **After precision reduction**: `east: 120.0, west: 120.0`
- **Canvas width calculation**: `Math.abs(120.0 - 120.0) = 0`
- **Result**: Zero-width canvas automatically hidden by minimum size check

### **Impact:**
- **Complete overlay failure**: Assets affected showed no visualization when clicked
- **Silent failure**: No error messages, overlays simply didn't appear
- **Scope**: 118 out of 200 assets (59%) were affected
- **Detection difficulty**: Required detailed debugging to identify precision as the cause

### **Resolution:**
1. **Modified `reduce_precision.py`**: Added special handling to preserve geographic bounds at 6 decimal places (~1 meter accuracy)
2. **Created `fix_bounds.py`**: Emergency script to restore original precision bounds from raw data files
3. **Selective precision**: Data arrays still use 2 significant digits, only bounds preserve higher precision
4. **Validation**: Confirmed all 118 affected assets now render correctly

### **Lessons Learned:**
- **Geographic data sensitivity**: Coordinate precision is critical for spatial extent calculations
- **Test edge cases**: Small geographic areas are particularly vulnerable to precision loss
- **Preserve critical data**: Not all numerical data can be treated equally for precision reduction
- **Silent failures**: Visualization bugs can be particularly difficult to debug without proper logging
- **Data validation**: Need systematic validation after any data transformation operations

### **Prevention Measures:**
- **Bounds preservation**: Always maintain geographic coordinates at sufficient precision
- **Automated testing**: Include overlay rendering tests in the development pipeline
- **Data integrity checks**: Validate that bounds maintain positive width/height after processing
- **Documentation**: Clearly document precision requirements for different data types