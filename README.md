# Additional PM2.5 Exposure Analysis Tool

An interactive web-based visualization tool for analyzing additional PM2.5 pollution exposure from industrial assets across multiple countries. This tool helps researchers, policymakers, and environmental scientists understand the geographic distribution and health impacts of additional pollution exposure from specific industrial facilities.

## Features

### 🗺️ Interactive Mapping
- **Asset-specific visualization**: View additional PM2.5 exposure from individual industrial facilities
- **Risk-based color coding**: Yellow to purple color scheme representing increasing additional health risk levels
- **Population-weighted circle sizing**: Circle size represents number of people exposed to additional pollution
- **Adaptive legends**: Dynamic legends showing actual circle sizes at current zoom levels

### 📍 Point Analysis Mode
- **Click anywhere analysis**: Click any location to see cumulative additional PM2.5 from all nearby assets within 100km
- **Visual feedback**: Red crosshair reticle with animated connection lines to contributing assets
- **Concentration-based colors**: Connection lines and bar charts use consistent risk-level colors
- **Detailed metrics**: Distance, direction, and contribution data for each contributing asset

## Technical Architecture

### Frontend (JavaScript + HTML5 Canvas)
- **Leaflet.js**: Interactive mapping with CartoDB Positron base tiles
- **Custom overlay rendering**: High-performance canvas rendering for large datasets
- **Modular design**: Separate classes for different overlay types and analysis modes

### Data Processing Pipeline
1. **Source rasters**: TIFF files with PM2.5 concentration and population data (`input_geotiffs/`)
2. **Unified processing**: Single-step pipeline transforms TIFF directly to optimized JSON (`overlays/`)
3. **Frontend rendering**: Canvas-based visualization with efficient data loading

**⚡ New Unified Pipeline (3.5x faster)**:
- **Single-step processing**: TIFF → JSON (eliminates 4 intermediate steps)
- **Full resolution preservation**: 601×601 pixels with smart edge trimming
- **WHO risk buckets**: 6 predefined exposure categories (Low → Extreme Additional Risk)
- **Real-time analytics**: Population exposure calculated client-side

## Installation & Setup

### Prerequisites
- Web server (local or remote) capable of serving static files
- Modern web browser with HTML5 Canvas support

### Quick Start
1. Clone this repository
2. Set up your data files (see Data Structure section)
3. Serve the files through a web server
4. Open `frontend/index.html` in your browser

### Data Structure
The tool expects data files in specific directories (excluded from git):

```
input_geotiffs/
└── {COUNTRY}/
    ├── {ASSET_ID}-v2.tiff         # PM2.5 concentration raster  
    └── {ASSET_ID}-pop-v3.tiff     # Population raster (updated version)

overlays/  
└── {COUNTRY}_{ASSET_ID}_data.json # Unified JSON with full-resolution data

assets.json                        # Asset metadata with overlay references
```

**📋 New JSON Structure** (for frontend integration):
- **Unified format**: Single JSON file per asset with concentration, population, and exposure analytics
- **WHO risk buckets**: Pre-calculated population counts by health risk categories  
- **Full resolution**: 601×601 pixel arrays with edge trimming metadata
- **Processing metadata**: Pipeline version, precision settings, and coordinate system info

## Usage

### Basic Asset Visualization
1. Open the application in your browser
2. Asset markers appear on the map, sized by total person-exposure impact
3. Click any asset marker to view detailed exposure analysis
4. Use the legend to understand color coding and circle sizing

### Point Analysis
1. Click anywhere on the map (not on an asset marker)
2. The system analyzes all assets within 100km of your click point
3. View cumulative additional PM2.5 exposure in the sidebar
4. Observe visual connections between contributing assets and your analysis point
5. Click "Exit Point Analysis Mode" to return to normal view

### Understanding the Data
- **Colors represent additional PM2.5 risk levels**:
  - Yellow: Low Additional Risk (0-12 μg/m³)
  - Orange: Elevated Additional Risk (12-35 μg/m³)
  - Red: Significant Additional Risk (35-55 μg/m³)
  - Dark Red: High Additional Risk (55-150 μg/m³)
  - Purple: Very High Additional Risk (150+ μg/m³)

- **Circle sizes represent population exposed** to additional pollution at each location
- **This shows additional exposure**, not total ambient air quality levels

## Development

### File Structure
```
frontend/
├── index.html                     # Main application page
├── js/
│   ├── map.js                    # Core mapping and analysis logic
│   ├── point-analysis-layer.js   # Visual overlay for point analysis
│   └── asset-panel.js            # Sidebar content management
└── css/                          # Styling (embedded in HTML)

project.md                        # Detailed technical documentation
Pollution Map Viz Best Practices.md  # Visualization design principles
```

### Key Technical Concepts
- **Coordinate Systems**: Uses `latLngToLayerPoint()` for stable overlay positioning
- **Risk-Based Classification**: Health-impact focused color schemes and terminology
- **Performance Optimization**: Canvas rendering and data caching for large datasets
- **Responsive Design**: Adaptive legends and mobile-friendly interface

## Scientific Context

This tool visualizes **additional PM2.5 exposure** from specific industrial assets, not total ambient air quality. This distinction is crucial for:
- **Attribution studies**: Understanding which facilities contribute to local pollution
- **Policy decisions**: Targeting specific sources for emission reductions
- **Health impact assessment**: Quantifying burden from individual pollution sources
- **Environmental justice**: Identifying disproportionate impacts on communities

## Deployment Status

✅ **Repository Ready**: This project is fully deployed and ready to use with new unified pipeline:
- **Complete dataset**: 200 assets across 24 countries with unified overlay data (657MB)
- **Performance improvement**: 3.5x faster processing with single-step pipeline
- **Data quality**: Full resolution preserved (601×601 pixels) with smart edge trimming  
- **Production ready**: All overlays generated with `unified_v3.0_risk_buckets` pipeline
- **Backup preserved**: Original multi-step pipeline data backed up to `overlays_backup_multistep_pipeline_20250904_091424/`

### Pipeline Upgrade Benefits
- **Simplified architecture**: 5-step → 1-step processing eliminates complexity
- **Higher resolution**: Full 601×601 pixel data vs. previous downsampling approaches
- **Better analytics**: WHO-based risk buckets with pre-calculated population statistics
- **Improved maintenance**: Single unified format reduces data management overhead
- **Enhanced performance**: 3.5x faster end-to-end processing for dataset updates

## Contributing

Contributions are welcome! Key areas for improvement:
- Performance optimizations for larger datasets  
- Additional export formats (CSV, GeoJSON)
- Mobile touch interface improvements
- Multi-point comparative analysis features

## License

This project is designed for research and policy applications. Contact the maintainer regarding data access and usage permissions.

## Contact

For questions about data access, technical implementation, or scientific methodology, please contact the project maintainer.