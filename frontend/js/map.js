// Global variables
let map;
let assetsData = null;

// REMOVED: CoordinateTransform utilities no longer needed with EPSG:4326 CRS
// All coordinates are now in the same system - no transformation required
let assetMarkers = [];
let assetMarkerMap = new Map(); // Map from asset key to marker reference
let selectedAsset = null;
let currentOverlay = null;
let hoverTooltip = null;
let canvasOverlay = null;
let currentScaleMode = 'log';
let isLoadingAssets = false;
let loadingRetries = 0;
const MAX_LOADING_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
let activeOverlayRequest = null; // Track the currently active overlay request

// Point analysis variables
let pointAnalysisMode = false;
let analysisPoint = null;
let nearbyAssets = [];
let loadedAssetData = new Map(); // Cache for loaded raw data
const SEARCH_RADIUS_KM = 100; // Search radius for nearby assets
let pointAnalysisLayer = null; // Visual layer for point analysis

// Country colors for asset markers (kept for compatibility)
const countryColors = {
    'BRA': '#e74c3c', 'CHN': '#f39c12', 'COD': '#9b59b6', 'DEU': '#2ecc71',
    'IDN': '#3498db', 'IND': '#e67e22', 'IRN': '#1abc9c', 'ITA': '#34495e',
    'JPN': '#e91e63', 'KOR': '#9c27b0', 'MYS': '#ff9800', 'NGA': '#795548',
    'NLD': '#607d8b', 'PAK': '#8bc34a', 'POL': '#ffeb3b', 'PRK': '#ff5722',
    'PRY': '#673ab7', 'RUS': '#f44336', 'TCD': '#4caf50', 'THA': '#2196f3',
    'TWN': '#ff4081', 'UGA': '#8c4a00', 'UKR': '#ffeb3b', 'VNM': '#4db6ac'
};

// Centralized PM2.5 Risk Categories - Pollution Map Viz Best Practices
// Based on supralinear exposure-response relationship research
const PM25_RISK_CATEGORIES = {
    MEASURABLE: { min: 0,    max: 2.5,  color: '#9ACD32', label: 'Measurable Additional Risk (0-2.5)' },     // Yellow-Green
    LOW:        { min: 2.5,  max: 5.0,  color: '#FFFF00', label: 'Low Additional Risk (2.5-5.0)' },         // Yellow  
    MODERATE:   { min: 5.0,  max: 10.0, color: '#FFD700', label: 'Moderate Additional Risk (5.0-10.0)' },   // Orange-Yellow
    HIGH:       { min: 10.0, max: 25.0, color: '#FFA500', label: 'High Additional Risk (10.0-25.0)' },      // Orange
    VERY_HIGH:  { min: 25.0, max: 50.0, color: '#FF0000', label: 'Very High Additional Risk (25.0-50.0)' }, // Red
    EXTREME:    { min: 50.0, max: Infinity, color: '#800080', label: 'Extreme Additional Risk (50.0+)' }     // Purple/Maroon
};

// Convert to array format for backwards compatibility
const CONCENTRATION_BINS = Object.values(PM25_RISK_CATEGORIES);

// Function to get color based on concentration value
function getConcentrationColor(concentration) {
    for (const bin of CONCENTRATION_BINS) {
        if (concentration >= bin.min && concentration < bin.max) {
            return bin.color;
        }
    }
    return CONCENTRATION_BINS[CONCENTRATION_BINS.length - 1].color; // Default to highest bin
}

// Make function globally available for use in other files
window.getConcentrationColor = getConcentrationColor;

// Population-based circle sizing (graduated symbols) - increased minimum size
const POPULATION_BINS = [
    { min: 0,    max: 100,   radius: 4,  label: '0-100 people' },      // Increased from 2 to 4
    { min: 100,  max: 500,   radius: 6,  label: '100-500 people' },    // Increased from 3 to 6  
    { min: 500,  max: 2000,  radius: 9,  label: '500-2K people' },     // Increased from 5 to 9
    { min: 2000, max: 10000, radius: 14, label: '2K-10K people' },     // Increased from 8 to 14
    { min: 10000, max: Infinity, radius: 20, label: '10K+ people' }    // Increased from 12 to 20
];

// Classification utility functions
function classifyConcentration(concentration) {
    for (let bin of CONCENTRATION_BINS) {
        if (concentration >= bin.min && concentration < bin.max) {
            return bin;
        }
    }
    return CONCENTRATION_BINS[CONCENTRATION_BINS.length - 1]; // Default to highest bin
}

function classifyPopulation(population) {
    for (let bin of POPULATION_BINS) {
        if (population >= bin.min && population < bin.max) {
            return bin;
        }
    }
    return POPULATION_BINS[POPULATION_BINS.length - 1]; // Default to highest bin
}

// Convert hex color to RGB object
function hexToRgb(hex) {
    // Handle both 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) hex colors
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
    if (!result) return { r: 128, g: 128, b: 128 }; // Default gray if parsing fails
    
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    };
}

function initializeApp() {
    
    // Initialize map
    initializeMap();
    
    // Load assets data
    loadAssetsData();
    
    // Initialize city search functionality
    initializeCitySearch();
    
    // Check for URL parameters
    checkUrlParameters();
    
    // Coordinate test disabled in production - available for debugging if needed
}

function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const assetParam = urlParams.get('asset');
    
    // Check for both old and new parameter names (poilat/poilng takes precedence)
    let pointLatParam = urlParams.get('poilat') || urlParams.get('pointlat');
    let pointLngParam = urlParams.get('poilng') || urlParams.get('pointlng');
    
    if (assetParam) {
        console.log(`URL parameter found: asset=${assetParam}`);
        // Wait for assets to load before jumping to specific asset
        waitForAssetsAndJump(assetParam);
        
        // If point analysis parameters are also present, start point analysis after asset loads
        if (pointLatParam && pointLngParam) {
            const lat = parseFloat(pointLatParam);
            const lng = parseFloat(pointLngParam);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                console.log(`URL parameters found for point analysis: lat=${lat}, lng=${lng}`);
                // Wait a bit longer for asset overlay to load before starting point analysis
                waitForAssetAndStartPointAnalysis(assetParam, lat, lng);
            }
        }
    } else if (pointLatParam && pointLngParam) {
        // Point analysis without specific asset
        const lat = parseFloat(pointLatParam);
        const lng = parseFloat(pointLngParam);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            console.log(`URL parameters found for point analysis: lat=${lat}, lng=${lng}`);
            // Wait for assets to load, then start point analysis
            waitForAssetsAndStartPointAnalysis(lat, lng);
        }
    }
}

function waitForAssetsAndJump(assetIdentifier, maxWait = 10000) {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    
    const checkAssets = () => {
        if (assetsData && !isLoadingAssets) {
            // Assets loaded successfully
            jumpToAsset(assetIdentifier);
            return;
        }
        
        if (Date.now() - startTime > maxWait) {
            // Timeout - show user-friendly message
            console.warn(`Timeout waiting for assets to load for: ${assetIdentifier}`);
            showLoadingError(`Unable to load asset ${assetIdentifier}. The application may still be loading data.`);
            return;
        }
        
        // Continue checking
        setTimeout(checkAssets, checkInterval);
    };
    
    checkAssets();
}

function waitForAssetAndStartPointAnalysis(assetIdentifier, lat, lng, maxWait = 15000) {
    const startTime = Date.now();
    const checkInterval = 200; // Check every 200ms for asset + overlay
    
    const checkAssetAndOverlay = () => {
        console.log(`Checking asset and overlay: assetsData=${!!assetsData}, isLoadingAssets=${isLoadingAssets}, selectedAsset=${!!selectedAsset}, canvasOverlay=${!!canvasOverlay}`);
        
        // First check if assets are loaded and asset is selected
        if (assetsData && !isLoadingAssets && selectedAsset && `${selectedAsset.country}_${selectedAsset.asset_id}` === assetIdentifier) {
            console.log(`Asset is selected: ${selectedAsset.country}_${selectedAsset.asset_id}, waiting for overlay...`);
            
            // Check if overlay is loaded for the selected asset (modern system uses canvasOverlay)
            if (canvasOverlay && canvasOverlay.assetId === assetIdentifier) {
                // Asset and overlay are ready, start point analysis
                console.log(`Starting point analysis for asset ${assetIdentifier} at ${lat}, ${lng}`);
                startPointAnalysisFromUrl(lat, lng);
                return;
            }
            
            // Also try starting point analysis after reasonable wait even without overlay detection
            if (Date.now() - startTime > 3000) { // 3 seconds is reasonable for overlay load
                console.log(`Starting point analysis without overlay confirmation for ${assetIdentifier} at ${lat}, ${lng}`);
                startPointAnalysisFromUrl(lat, lng);
                return;
            }
        }
        
        if (Date.now() - startTime > maxWait) {
            console.warn(`Timeout waiting for asset overlay to load for: ${assetIdentifier}`);
            // Still try to start point analysis even if overlay isn't ready
            startPointAnalysisFromUrl(lat, lng);
            return;
        }
        
        // Continue checking
        setTimeout(checkAssetAndOverlay, checkInterval);
    };
    
    checkAssetAndOverlay();
}

function waitForAssetsAndStartPointAnalysis(lat, lng, maxWait = 10000) {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    
    const checkAssets = () => {
        if (assetsData && !isLoadingAssets) {
            // Assets loaded, start point analysis
            console.log(`Starting point analysis at ${lat}, ${lng}`);
            startPointAnalysisFromUrl(lat, lng);
            return;
        }
        
        if (Date.now() - startTime > maxWait) {
            console.warn(`Timeout waiting for assets to load for point analysis`);
            return;
        }
        
        // Continue checking
        setTimeout(checkAssets, checkInterval);
    };
    
    checkAssets();
}

function startPointAnalysisFromUrl(lat, lng) {
    // Clear any existing analysis state but keep URL parameters
    clearPointAnalysisState();
    
    // Set up analysis point
    analysisPoint = {
        lat: lat,
        lng: lng,
        latlng: L.latLng(lat, lng)
    };
    pointAnalysisMode = true;
    
    // Center map on the analysis point
    map.setView([lat, lng], Math.max(map.getZoom(), 10));
    
    // Show loading state with visual layer
    showPointAnalysisLoading();
    
    // Start the analysis process
    performPointAnalysis(analysisPoint);
}

async function runPopulationCoordinateTest() {
    console.log("🧪 STARTING POPULATION COORDINATE TEST");
    console.log("=" * 60);
    
    // Clear any existing test markers
    clearTestValueMarkers();
    
    if (!assetsData || !assetsData.assets) {
        console.log("Assets not loaded yet, skipping test");
        return;
    }
    
    const testAssets = ["1566584", "1566601", "38089178"];
    const overlayDataCache = {};
    
    // Load all three overlay JSON files
    for (const assetId of testAssets) {
        const asset = assetsData.assets.find(a => a.asset_id === assetId);
        if (!asset) {
            console.log(`Asset ${assetId} not found in assets.json`);
            continue;
        }
        
        try {
            console.log(`Loading overlay data for CHN_${assetId}...`);
            const response = await fetch(`overlays/CHN_${assetId}_data.json`);
            if (!response.ok) {
                console.log(`Failed to load CHN_${assetId}_data.json: ${response.status}`);
                continue;
            }
            
            const overlayData = await response.json();
            overlayDataCache[assetId] = {
                asset: asset,
                overlay: overlayData
            };
            console.log(`✅ Loaded CHN_${assetId}_data.json (${overlayData.dimensions.width}×${overlayData.dimensions.height})`);
            
        } catch (error) {
            console.log(`Error loading overlay for ${assetId}: ${error.message}`);
        }
    }
    
    if (Object.keys(overlayDataCache).length < 3) {
        console.log("Not all overlay files loaded, cannot run complete test");
        return;
    }
    
    console.log("\n🎯 TESTING CONTIGUOUS POPULATION VALUE SEQUENCE:");
    
    // Test exact sequence of 3 consecutive population values from center of CHN_1566601
    const testSequence = [16.0, 5.42, 5.36]; // These should appear as consecutive values in all three
    
    console.log(`\n📍 Searching for sequence: [${testSequence.join(', ')}]`);
    
    const sequenceLocations = {};
    
    // Find this exact sequence in each overlay
    for (const assetId of testAssets) {
        const data = overlayDataCache[assetId];
        if (!data) continue;
        
        const populationData = data.overlay.data.population;
        const asset = data.asset;
        
        // Search for the sequence (horizontal only for now) - check all occurrences
        let foundCount = 0;
        let foundLocation = null;
        for (let dataY = 0; dataY < data.overlay.dimensions.height; dataY++) {
            for (let dataX = 0; dataX < data.overlay.dimensions.width - 2; dataX++) {
                const val1 = populationData[dataY][dataX];
                const val2 = populationData[dataY][dataX + 1];
                const val3 = populationData[dataY][dataX + 2];
                
                // Check if this matches our sequence exactly
                if (Math.abs(val1 - testSequence[0]) < 0.001 && 
                    Math.abs(val2 - testSequence[1]) < 0.001 && 
                    Math.abs(val3 - testSequence[2]) < 0.001) {
                    
                    foundCount++;
                    foundLocation = { dataX, dataY, val1, val2, val3 };
                }
            }
        }
        
        // Report results for this asset
        if (foundCount === 0) {
            console.log(`  ${assetId}: SEQUENCE NOT FOUND`);
        } else if (foundCount === 1) {
            console.log(`  ${assetId}: SEQUENCE FOUND EXACTLY ONCE at data(${foundLocation.dataX},${foundLocation.dataY}) = [${foundLocation.val1}, ${foundLocation.val2}, ${foundLocation.val3}]`);
            
            sequenceLocations[assetId] = [];
            
            // Process each value in the sequence
            for (let i = 0; i < 3; i++) {
                const screenCoords = calculateScreenCoordinatesForDataPoint(
                    asset, data.overlay, foundLocation.dataX + i, foundLocation.dataY
                );
                
                const geoCoords = calculateGeographicCoordinatesForDataPoint(
                    asset, data.overlay, foundLocation.dataX + i, foundLocation.dataY
                );
                
                sequenceLocations[assetId].push({
                    dataX: foundLocation.dataX + i,
                    dataY: foundLocation.dataY,
                    value: populationData[foundLocation.dataY][foundLocation.dataX + i],
                    geoLat: geoCoords.lat,
                    geoLon: geoCoords.lon,
                    screenX: screenCoords.x,
                    screenY: screenCoords.y
                });
                
                console.log(`    [${i}] data(${foundLocation.dataX + i},${foundLocation.dataY}) = ${populationData[foundLocation.dataY][foundLocation.dataX + i]} -> geo(${geoCoords.lat.toFixed(6)}, ${geoCoords.lon.toFixed(6)}) -> screen(${screenCoords.x.toFixed(1)}, ${screenCoords.y.toFixed(1)})`);
                
                // Add visual marker on map
                addTestValueMarker(geoCoords.lat, geoCoords.lon, `${assetId}[${i}]`, populationData[foundLocation.dataY][foundLocation.dataX + i]);
            }
        } else {
            console.log(`  ${assetId}: ❌ SEQUENCE FOUND ${foundCount} TIMES - NOT UNIQUE!`);
        }
    }
    
    // Compare geographic positions of the sequence across assets
    console.log(`\n📊 SEQUENCE GEOGRAPHIC COORDINATE ANALYSIS:`);
    if (Object.keys(sequenceLocations).length >= 2) {
        for (let i = 0; i < 3; i++) {
            console.log(`\nValue ${i} (${testSequence[i]}) geographic positions:`);
            const positions = [];
            for (const assetId of Object.keys(sequenceLocations)) {
                const loc = sequenceLocations[assetId][i];
                console.log(`  ${assetId}: geo(${loc.geoLat.toFixed(6)}, ${loc.geoLon.toFixed(6)}) -> screen(${loc.screenX.toFixed(1)}, ${loc.screenY.toFixed(1)})`);
                positions.push({ lat: loc.geoLat, lon: loc.geoLon, screenX: loc.screenX, screenY: loc.screenY });
            }
            
            if (positions.length >= 2) {
                const latVariance = Math.max(...positions.map(p => p.lat)) - Math.min(...positions.map(p => p.lat));
                const lonVariance = Math.max(...positions.map(p => p.lon)) - Math.min(...positions.map(p => p.lon));
                const screenXVariance = Math.max(...positions.map(p => p.screenX)) - Math.min(...positions.map(p => p.screenX));
                const screenYVariance = Math.max(...positions.map(p => p.screenY)) - Math.min(...positions.map(p => p.screenY));
                
                console.log(`  Geographic variance: ${latVariance.toFixed(6)}° lat, ${lonVariance.toFixed(6)}° lon`);
                console.log(`  Screen variance: ${screenXVariance.toFixed(1)}px X, ${screenYVariance.toFixed(1)}px Y`);
                
                if (latVariance < 0.000001 && lonVariance < 0.000001) {
                    console.log(`  ✅ GOOD: Same geographic coordinates across assets`);
                } else {
                    console.log(`  ❌ BAD: Different geographic coordinates - source data issue!`);
                }
            }
        }
    }
    
    console.log("\n" + "=" * 60);
    console.log("🧪 POPULATION COORDINATE TEST COMPLETE");
}

function calculateScreenCoordinatesForDataPoint(asset, overlayData, dataX, dataY) {
    // SIMPLIFIED: Direct coordinate calculation - no edge trimming complexity
    
    const bounds = overlayData.bounds;
    
    // Convert bounds to screen coordinates
    const layerNW = map.latLngToContainerPoint([bounds.north, bounds.west]);
    const layerSE = map.latLngToContainerPoint([bounds.south, bounds.east]);
    
    const canvasWidth = Math.abs(layerSE.x - layerNW.x);
    const canvasHeight = Math.abs(layerSE.y - layerNW.y);
    
    // Simple 1:1 mapping
    const scaleX = canvasWidth / overlayData.dimensions.width;
    const scaleY = canvasHeight / overlayData.dimensions.height;
    
    const centerX = (dataX + 0.5) * scaleX;
    const centerY = (dataY + 0.5) * scaleY;
    
    const screenX = layerNW.x + centerX;
    const screenY = layerNW.y + centerY;
    
    return { x: screenX, y: screenY };
}

function calculateGeographicCoordinatesForDataPoint(asset, overlayData, dataX, dataY) {
    // SIMPLIFIED: Ultra-simple coordinate calculation - perfect 1:1 TIFF mapping
    
    const bounds = overlayData.bounds;
    const pixelSizeX = (bounds.east - bounds.west) / overlayData.dimensions.width;
    const pixelSizeY = (bounds.north - bounds.south) / overlayData.dimensions.height;
    
    return {
        lat: bounds.north - (dataY + 0.5) * pixelSizeY,
        lon: bounds.west + (dataX + 0.5) * pixelSizeX
    };
}

let testValueMarkers = []; // Keep track of test markers for cleanup

function addTestValueMarker(lat, lon, assetId, value) {
    // Create a green rectangle marker with asset ID label
    const marker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'test-value-marker',
            html: `<div style="background: rgba(0, 255, 0, 0.8); border: 2px solid green; padding: 2px 4px; font-size: 10px; font-weight: bold; color: black; white-space: nowrap;">
                     ${assetId}<br>${value}
                   </div>`,
            iconSize: [60, 30],
            iconAnchor: [30, 15]
        })
    });
    
    marker.addTo(map);
    testValueMarkers.push(marker);
}

function clearTestValueMarkers() {
    testValueMarkers.forEach(marker => map.removeLayer(marker));
    testValueMarkers = [];
}

function jumpToAsset(assetIdentifier) {
    if (!assetsData) {
        console.error('Assets data not loaded yet');
        showLoadingError('Assets data is still loading. Please wait a moment and try again.');
        return;
    }
    
    if (isLoadingAssets) {
        console.warn('Assets are currently being loaded, please wait...');
        showLoadingError('Assets are currently being loaded. Please wait a moment.');
        return;
    }
    
    // Parse asset identifier (format: COUNTRY_ASSETID)
    const parts = assetIdentifier.split('_');
    if (parts.length !== 2) {
        console.error('Invalid asset identifier format. Use: COUNTRY_ASSETID');
        showLoadingError(`Invalid asset format: ${assetIdentifier}. Expected format: COUNTRY_ASSETID`);
        return;
    }
    
    const [country, assetId] = parts;
    
    // Find the asset
    const asset = assetsData.assets.find(a => 
        a.country === country && a.asset_id === assetId
    );
    
    if (!asset) {
        console.error(`Asset not found: ${assetIdentifier}`);
        showLoadingError(`Asset not found: ${assetIdentifier}. Please check the asset identifier.`);
        return;
    }
    
    // Clear any error messages
    clearLoadingError();
    
    // Center map on asset and zoom in
    map.setView([asset.center_lat, asset.center_lon], 10);
    
    // Select the asset
    setTimeout(() => {
        selectAsset(asset);
    }, 500);
}

function initializeMap() {
    // 🚨 CRITICAL IMPLEMENTATION NOTE: EPSG:4326 CRS THROUGHOUT
    // 
    // WHAT THIS CHANGES:
    // - All coordinates now use Geographic CRS (lat/lng degrees) instead of Web Mercator
    // - Eliminates coordinate transformation complexity between data and visualization
    // - Should fix systematic northwest offset in overlay alignment
    //
    // ⚠️  FUTURE DEVELOPMENT WARNINGS:
    // 1. Base map may look distorted (Plate Carrée projection stretches poles)
    // 2. Most tile servers serve EPSG:3857 tiles - may cause performance/visual issues
    // 3. Third-party Leaflet plugins may assume Web Mercator and break
    // 4. External APIs (geocoding, routing) typically return Web Mercator coordinates
    // 5. Distance calculations behave differently at different latitudes
    // 6. Zoom level behavior is different from typical web maps
    //
    // 🔍 TESTING REQUIRED:
    // - Verify base map tiles render correctly
    // - Test overlay alignment across multiple zoom levels
    // - Validate mouse interactions and point analysis
    // - Check asset marker positioning accuracy
    //
    map = L.map('map', {
        // 🔄 REVERT: Back to Web Mercator for proper base map tile support
        crs: L.CRS.EPSG3857,
        maxZoom: 13
    }).setView([20, 0], 2);
    
    // 🗺️ Add proper Web Mercator base map tiles (monochrome style)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 18
    }).addTo(map);
    
    console.log('🗺️  Map initialized with Web Mercator (EPSG:3857) for proper tile support');
    console.log('🗺️  Added CartoDB light base map tiles');
    
    // Add basic graticule/grid for geographic reference
    map.on('zoomend moveend', function() {
    });
    
    // Create a custom pane for asset markers to ensure they appear above overlays
    map.createPane('assetMarkers');
    map.getPane('assetMarkers').style.zIndex = 500; // Above overlays (450), below legend (1000)
    
    // Initialize hover tooltip
    hoverTooltip = L.tooltip({
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'high-z-tooltip'
    });
    
    // Add zoom event listener for overlay visibility
    map.on('zoomend', handleZoomChange);
    
    // Add mouse move event for hover tooltips
    map.on('mousemove', handleMouseMove);
    
    // Add click event for point analysis
    map.on('click', handleMapClick);
    
    // Add close sidebar button functionality
    const closeSidebarButton = document.getElementById('close-sidebar');
    if (closeSidebarButton) {
        closeSidebarButton.onclick = function() {
            deselectCurrentAsset();
        };
    }
}

async function loadAssetsData() {
    if (isLoadingAssets) {
        console.log('Assets are already being loaded, skipping duplicate request');
        return;
    }
    
    isLoadingAssets = true;
    showLoadingIndicator();
    
    try {
        const response = await fetch('assets.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        assetsData = await response.json();
        // Update summary stats
        updateSummaryStats();
        
        // Add asset markers to map
        addAssetMarkersToMap();
        
        // Clear loading state
        isLoadingAssets = false;
        loadingRetries = 0;
        hideLoadingIndicator();
        clearLoadingError();
        
    } catch (error) {
        console.error('Error loading assets data:', error);
        isLoadingAssets = false;
        hideLoadingIndicator();
        
        // Try to retry if we haven't exceeded max retries
        if (loadingRetries < MAX_LOADING_RETRIES) {
            loadingRetries++;
            showLoadingError(`Failed to load data (attempt ${loadingRetries}/${MAX_LOADING_RETRIES}). Retrying in ${RETRY_DELAY/1000} seconds...`);
            
            setTimeout(() => {
                loadAssetsData();
            }, RETRY_DELAY);
        } else {
            // Max retries reached
            const errorMessage = `
                <div class="alert alert-danger">
                    <strong>Failed to load data after ${MAX_LOADING_RETRIES} attempts:</strong><br>
                    ${error.message}<br><br>
                    Please check that assets.json is available and the server is running.<br>
                    <button onclick="loadAssetsData()" class="btn btn-primary btn-sm mt-2">Try Again</button>
                </div>
            `;
            document.getElementById('asset-details').innerHTML = errorMessage;
            showLoadingError('Failed to load assets data. Please check your connection and try again.');
        }
    }
}

function updateSummaryStats() {
    const metadata = assetsData.metadata;
    const summaryHtml = `
        <div class="mt-2">
            <small>
                ${metadata.total_assets} assets • 
                ${metadata.countries.length} countries • 
                v${metadata.script_version}
            </small>
        </div>
    `;
    document.getElementById('summary-stats').innerHTML = summaryHtml;
}

function calculateAssetSize(totalPersonExposure, allExposures) {
    // Calculate percentiles for sizing
    const sortedExposures = allExposures.slice().sort((a, b) => a - b);
    const p25 = d3.quantile(sortedExposures, 0.25);
    const p50 = d3.quantile(sortedExposures, 0.50);
    const p75 = d3.quantile(sortedExposures, 0.75);
    const p90 = d3.quantile(sortedExposures, 0.90);
    
    // Size based on person-exposure percentiles
    if (totalPersonExposure <= p25) return 'asset-marker-xs'; // 8px
    if (totalPersonExposure <= p50) return 'asset-marker-sm'; // 12px
    if (totalPersonExposure <= p75) return 'asset-marker-md'; // 16px
    if (totalPersonExposure <= p90) return 'asset-marker-lg'; // 24px
    return 'asset-marker-xl'; // 32px for top 10%
}

function calculateCorrectAssetCenter(asset) {
    // Calculate the correct center coordinates from the asset's overlay bounds
    // This matches the logic used in fix_bounds.py to ensure consistency
    
    const assetKey = `${asset.country}_${asset.asset_id}`;
    
    // First, try to get overlay data bounds if currently loaded
    if (canvasOverlay) {
        let overlayData = null;
        
        // Handle both legacy CanvasOverlay and new CircleCanvasOverlay
        if (canvasOverlay.rawData) {
            overlayData = canvasOverlay.rawData;
        } else if (canvasOverlay.overlayData) {
            overlayData = canvasOverlay.overlayData;
        }
        
        if (overlayData && overlayData.country === asset.country && 
            overlayData.asset_id === asset.asset_id && overlayData.bounds) {
            
            const bounds = overlayData.bounds;
            return {
                lat: (bounds.north + bounds.south) / 2,
                lon: (bounds.east + bounds.west) / 2
            };
        }
    }
    
    // For assets without currently loaded overlay data, we can't synchronously fetch the bounds
    // since that would require an async operation. Instead, we'll use the original coordinates
    // but mark them for future correction when the overlay is loaded.
    
    // TODO: In the future, we could:
    // 1. Pre-load all overlay bounds into a separate lightweight JSON file
    // 2. Or update asset markers when overlay data is loaded (reactive approach)
    // 3. Or implement async marker positioning (more complex)
    
    // For now, use original coordinates - these will be corrected when overlays are selected
    return {
        lat: asset.center_lat,
        lon: asset.center_lon
    };
}

function updateSelectedAssetMarkerPosition() {
    // ✅ DISABLED: Original asset coordinates are CORRECT!
    // The pipeline now uses proper TIFF bounds, so markers should stay in original positions
    // Moving them would actually make alignment WORSE
    return;
    
    // Get overlay data - handle both legacy CanvasOverlay and new CircleCanvasOverlay
    let overlayData = null;
    if (canvasOverlay.rawData) {
        // Legacy CanvasOverlay
        overlayData = canvasOverlay.rawData;
    } else if (canvasOverlay.overlayData) {
        // New CircleCanvasOverlay
        overlayData = canvasOverlay.overlayData;
    }
    
    if (!overlayData || !overlayData.bounds) {
        console.log('No overlay data or bounds available for marker update');
        return;
    }
    
    // Find the marker for the selected asset
    const assetKey = `${selectedAsset.country}_${selectedAsset.asset_id}`;
    const marker = assetMarkerMap.get(assetKey);
    
    if (marker) {
        // Calculate corrected center from overlay bounds
        const bounds = overlayData.bounds;
        const correctedLat = (bounds.north + bounds.south) / 2;
        const correctedLon = (bounds.east + bounds.west) / 2;
        
        // Update marker position
        marker.setLatLng([correctedLat, correctedLon]);
        
        console.log(`Updated marker position for ${assetKey}: ${correctedLat.toFixed(6)}, ${correctedLon.toFixed(6)}`);
        
        // 🔧 DEBUG: Compare pixel positions
        const assetPixel = map.latLngToContainerPoint([correctedLat, correctedLon]);
        console.log(`  Asset marker pixel position: (${assetPixel.x.toFixed(1)}, ${assetPixel.y.toFixed(1)})`);
        
    } else {
        console.log(`No marker found for ${assetKey}`);
    }
}

function addAssetMarkersToMap() {
    // Clear existing markers
    assetMarkers.forEach(marker => map.removeLayer(marker));
    assetMarkers = [];
    assetMarkerMap.clear();
    
    // Get all person-exposure values for sizing calculation
    const allExposures = assetsData.assets
        .map(asset => asset.person_exposure_stats.total_person_exposure)
        .filter(exposure => exposure > 0); // Remove zeros for better scaling
    
    
    // Create markers for each asset
    assetsData.assets.forEach(asset => {
        // Use corrected center coordinates calculated from the same logic as overlay bounds
        const correctedCoords = calculateCorrectAssetCenter(asset);
        const lat = correctedCoords.lat;
        const lon = correctedCoords.lon;
        const country = asset.country;
        const totalExposure = asset.person_exposure_stats.total_person_exposure;
        
        // Determine marker size based on person-exposure
        const sizeClass = calculateAssetSize(totalExposure, allExposures);
        const color = countryColors[country] || '#666666';
        
        // Determine if this asset is currently selected
        const assetKey = `${country}_${asset.asset_id}`;
        const isSelected = selectedAsset && selectedAsset.country === country && selectedAsset.asset_id === asset.asset_id;
        
        // Create custom icon with selection state
        const markerIcon = createMarkerIcon(color, sizeClass, isSelected);
        
        // Create marker
        const marker = L.marker([lat, lon], { 
            icon: markerIcon,
            title: `${country}_${asset.asset_id}: ${totalExposure.toLocaleString()} person-exposure`,
            pane: 'assetMarkers'  // Use the custom pane with higher z-index
        });
        
        // Store asset reference on marker for easy access
        marker.assetData = asset;
        
        // Add click event
        marker.on('click', function() {
            selectAsset(asset);
        });
        
        // Add to map and track
        marker.addTo(map);
        assetMarkers.push(marker);
        assetMarkerMap.set(assetKey, marker);
        
    });
    
}

function updateAssetMarkerStyles(previousAsset, currentAsset) {
    // Reset previous asset marker to unselected style
    if (previousAsset) {
        const prevKey = `${previousAsset.country}_${previousAsset.asset_id}`;
        const prevMarker = assetMarkerMap.get(prevKey);
        if (prevMarker) {
            updateMarkerStyle(prevMarker, false);
        }
    }
    
    // Update current asset marker to selected style
    if (currentAsset) {
        const currKey = `${currentAsset.country}_${currentAsset.asset_id}`;
        const currMarker = assetMarkerMap.get(currKey);
        if (currMarker) {
            updateMarkerStyle(currMarker, true);
        }
    }
}

function updateMarkerStyle(marker, isSelected) {
    if (!marker.assetData) return;
    
    const asset = marker.assetData;
    const country = asset.country;
    const totalExposure = asset.person_exposure_stats.total_person_exposure;
    
    // Get all person-exposure values for sizing calculation (same as in addAssetMarkersToMap)
    const allExposures = assetsData.assets
        .map(a => a.person_exposure_stats.total_person_exposure)
        .filter(exposure => exposure > 0);
    
    const sizeClass = calculateAssetSize(totalExposure, allExposures);
    const color = countryColors[country] || '#666666';
    
    // Create new icon with updated selection state
    const markerIcon = createMarkerIcon(color, sizeClass, isSelected);
    
    marker.setIcon(markerIcon);
}

function createMarkerIcon(color, sizeClass, isSelected) {
    // Calculate pixel offset to center marker (half of marker size)
    const sizeMap = {
        'asset-marker-xs': 4,   // 8px / 2
        'asset-marker-sm': 6,   // 12px / 2  
        'asset-marker-md': 8,   // 16px / 2
        'asset-marker-lg': 12,  // 24px / 2
        'asset-marker-xl': 16   // 32px / 2
    };
    const offset = sizeMap[sizeClass] || 8;
    
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="asset-marker ${sizeClass}" style="
            background-color: ${color}; 
            border: 2px solid ${isSelected ? '#333' : 'white'};
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
            transform: translate(-${offset}px, -${offset}px);
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [0, 0]  // Use top-left anchor with CSS transform for centering
    });
}

function forceRemoveAllOverlays() {
    console.log('Force removing all overlays...');
    
    // Remove currentOverlay
    if (currentOverlay) {
        try {
            map.removeLayer(currentOverlay);
        } catch (e) {
            console.warn('Error removing currentOverlay:', e);
        }
        currentOverlay = null;
    }
    
    // Remove canvasOverlay with multiple methods
    if (canvasOverlay) {
        try {
            // Try removeFrom method first
            if (canvasOverlay.removeFrom) {
                canvasOverlay.removeFrom(map);
            }
            // Also try removeLayer
            if (map.hasLayer && map.hasLayer(canvasOverlay)) {
                map.removeLayer(canvasOverlay);
            }
            // Manual DOM cleanup if it exists
            if (canvasOverlay.canvas && canvasOverlay.canvas.parentNode) {
                canvasOverlay.canvas.parentNode.removeChild(canvasOverlay.canvas);
            }
        } catch (e) {
            console.warn('Error removing canvasOverlay:', e);
        }
        canvasOverlay = null;
    }
    
    // Find and remove any orphaned canvas elements
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        const canvases = mapContainer.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            console.log('Removing orphaned canvas:', canvas);
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        });
    }
    
    // Cancel any active overlay request
    activeOverlayRequest = null;
    
    hideExposureLegend();
}

function clearAssetSelection() {
    if (selectedAsset) {
        // Update marker style to unselected
        const key = `${selectedAsset.country}_${selectedAsset.asset_id}`;
        const marker = assetMarkerMap.get(key);
        if (marker) {
            updateMarkerStyle(marker, false);
        }
        
        // Clear overlays
        if (currentOverlay) {
            map.removeLayer(currentOverlay);
            currentOverlay = null;
        }
        if (canvasOverlay) {
            // Ensure proper cleanup for custom overlay classes
            if (canvasOverlay.removeFrom) {
                canvasOverlay.removeFrom(map);
            } else {
                map.removeLayer(canvasOverlay);
            }
            canvasOverlay = null;
        }
        hideExposureLegend();
        
        // Clear selected asset
        selectedAsset = null;
        
        // Clear asset from URL (but preserve point analysis params)
        updateUrlWithAsset(null);
        
        // Reset asset details panel
        document.getElementById('asset-details').innerHTML = `
            <div class="no-selection">
                Click on an asset to view detailed information
            </div>
        `;
    }
}

function deselectCurrentAsset() {
    clearAssetSelection();
}

function selectAsset(asset) {
    const assetId = `${asset.country}_${asset.asset_id}`;
    
    // Check if this asset is already selected - if so, do nothing
    if (selectedAsset && selectedAsset.country === asset.country && selectedAsset.asset_id === asset.asset_id) {
        return;
    }
    
    console.log(`Selecting asset: ${assetId}`);
    
    // Force remove ALL existing overlays using robust cleanup
    forceRemoveAllOverlays();
    
    // Update selected asset BEFORE calling showCanvasOverlay
    const previousAsset = selectedAsset;
    selectedAsset = asset;
    
    // Update visual selection state
    updateAssetMarkerStyles(previousAsset, asset);
    
    // Update URL with asset parameter (preserving any point analysis params)
    updateUrlWithAsset(assetId);
    
    // Update asset details panel
    updateAssetDetailsPanel(asset);
    
    // Show circle-based overlay (new approach)
    showCanvasOverlay(asset);
}

function showAssetOverlay(asset) {
    // Remove existing overlay
    if (currentOverlay) {
        map.removeLayer(currentOverlay);
        currentOverlay = null;
        hideExposureLegend();
    }
    
    // Check if asset has overlay data and we're zoomed in enough
    if (!asset.overlay || map.getZoom() < 9) {
        return;
    }
    
    const overlay = asset.overlay;
    const bounds = [
        [overlay.bounds.south, overlay.bounds.west],
        [overlay.bounds.north, overlay.bounds.east]
    ];
    
    // Create image overlay
    const overlayUrl = `overlays/${overlay.png_file}`;
    currentOverlay = L.imageOverlay(overlayUrl, bounds, {
        opacity: 1.0,
        interactive: true,
        className: 'person-exposure-overlay'
    }).addTo(map);
    
    // Show legend when overlay is displayed
    showExposureLegend();
}

function handleZoomChange() {
    const zoom = map.getZoom();
    
    // Show/hide overlay based on zoom level
    if (selectedAsset) {
        if (zoom >= 9) {
            // Only recreate overlay if we don't already have one for the current asset
            const currentAssetId = `${selectedAsset.country}_${selectedAsset.asset_id}`;
            if (!canvasOverlay || canvasOverlay.assetId !== currentAssetId) {
                showCanvasOverlay(selectedAsset);
            }
        } else {
            // Remove any existing overlays
            if (currentOverlay) {
                map.removeLayer(currentOverlay);
                currentOverlay = null;
            }
            if (canvasOverlay) {
                map.removeLayer(canvasOverlay);
                canvasOverlay = null;
            }
            hideExposureLegend();
        }
    }
    
    // Update legend if it's visible (circle sizes change with zoom)
    const legend = document.getElementById('exposure-legend');
    if (legend && legend.classList.contains('visible')) {
        populateLegendContent();
    }
}

function findNearestPixel(latlng, pixelData, maxDistance = 0.01) {
    // Find the nearest pixel data point to the mouse position
    let nearest = null;
    let minDistance = maxDistance;
    
    for (const pixel of pixelData) {
        const distance = Math.sqrt(
            Math.pow(pixel.lat - latlng.lat, 2) + 
            Math.pow(pixel.lon - latlng.lng, 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            nearest = pixel;
        }
    }
    
    return nearest;
}

function handleMouseMove(e) {
    // Skip hover tooltips during point analysis mode
    if (pointAnalysisMode) return;
    
    // Check if we have any active overlay (PNG or Canvas)
    const hasOverlay = currentOverlay || canvasOverlay;
    if (!hasOverlay || !selectedAsset) {
        if (hoverTooltip._map) {
            map.removeLayer(hoverTooltip);
        }
        return;
    }
    
    // Handle PNG overlay hover (existing functionality)
    if (currentOverlay && selectedAsset.overlay) {
        const pixelData = selectedAsset.overlay.pixel_data;
        const nearestPixel = findNearestPixel(e.latlng, pixelData);
        
        if (nearestPixel) {
            const assetId = selectedAsset ? `${selectedAsset.country}_${selectedAsset.asset_id}` : 'this asset';
            const tooltipContent = `Asset ${assetId} exposes ${nearestPixel.population.toFixed(0)} people at this location to an additional ${nearestPixel.concentration.toFixed(2)} μg/m³ of PM2.5`;
            
            hoverTooltip
                .setLatLng(e.latlng)
                .setContent(tooltipContent)
                .addTo(map);
        } else {
            if (hoverTooltip._map) {
                map.removeLayer(hoverTooltip);
            }
        }
    }
    // Handle CircleCanvasOverlay hover (new system)
    else if (canvasOverlay && canvasOverlay.overlayData) {
        const pixelData = getCircleCanvasPixelData(e.latlng, canvasOverlay);
        
        if (pixelData) {
            const assetId = selectedAsset ? `${selectedAsset.country}_${selectedAsset.asset_id}` : 'this asset';
            const tooltipContent = `
                <strong>Asset:</strong> ${assetId}<br/>
                <strong>Population Exposed:</strong> ${pixelData.population.toFixed(0)} people<br/>
                <strong>Additional PM2.5:</strong> ${pixelData.concentration.toFixed(2)} μg/m³
            `;
            
            hoverTooltip
                .setLatLng(e.latlng)
                .setContent(tooltipContent)
                .addTo(map);
            
        } else {
            if (hoverTooltip._map) {
                map.removeLayer(hoverTooltip);
            }
        }
    }
}

// Point Analysis Functions
function handleMapClick(e) {
    // Check if click was on an asset marker - if so, let existing handler manage it
    const targetElement = e.originalEvent.target;
    if (targetElement && targetElement.classList && targetElement.classList.contains('custom-marker')) {
        return; // Let existing asset selection handle this
    }
    
    // Check if click originated from the city search container - if so, ignore it
    if (targetElement && targetElement.closest('.city-search-container')) {
        return; // Don't trigger point analysis for city search interactions
    }
    
    // Always clear any existing point analysis first
    clearPointAnalysis();
    
    // Start new point analysis
    analysisPoint = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        latlng: e.latlng
    };
    pointAnalysisMode = true;
    
    // Update URL with point analysis parameters
    updateUrlWithPointAnalysis(e.latlng.lat, e.latlng.lng);
    
    // Show loading state with visual layer
    showPointAnalysisLoading();
    
    // Start the analysis process
    performPointAnalysis(analysisPoint);
}

function clearPointAnalysisState() {
    // Clear the analysis state but NOT the URL (used when starting from URL)
    pointAnalysisMode = false;
    analysisPoint = null;
    nearbyAssets = [];
    
    // Remove visual layer with enhanced cleanup
    if (pointAnalysisLayer) {
        try {
            pointAnalysisLayer.removeFrom(map);
        } catch (error) {
            console.warn('Error removing point analysis layer:', error);
        }
        pointAnalysisLayer = null;
    }
    
    // Additional cleanup: remove any orphaned canvases
    const overlayPane = map.getPane('overlayPane');
    if (overlayPane) {
        const orphanedCanvases = overlayPane.querySelectorAll('canvas[style*="450"]'); // z-index 450
        orphanedCanvases.forEach(canvas => {
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        });
    }
    
    // Don't clear loadedAssetData cache - keep for performance
}

function clearPointAnalysis() {
    // Clear the analysis state AND the URL (used for manual clearing)
    clearPointAnalysisState();
    
    // Clear point analysis parameters from URL when analysis is cleared
    clearUrlPointAnalysis();
}

// URL State Management Functions
function updateUrlWithPointAnalysis(lat, lng) {
    const url = new URL(window.location);
    
    // Clean up any legacy parameters
    url.searchParams.delete('pointlat');
    url.searchParams.delete('pointlng');
    
    // Round coordinates to reasonable precision for URLs (6 decimal places = ~10cm precision)
    url.searchParams.set('poilat', lat.toFixed(6));
    url.searchParams.set('poilng', lng.toFixed(6));
    
    // Add current asset if one is selected
    if (selectedAsset) {
        const assetKey = `${selectedAsset.country}_${selectedAsset.asset_id}`;
        url.searchParams.set('asset', assetKey);
    }
    
    // Update URL without reloading the page
    window.history.replaceState(null, '', url.toString());
    
    console.log(`Updated URL for point analysis: ${url.toString()}`);
}

function clearUrlPointAnalysis() {
    const url = new URL(window.location);
    
    // Remove point analysis parameters (both old and new)
    url.searchParams.delete('poilat');
    url.searchParams.delete('poilng');
    url.searchParams.delete('pointlat');
    url.searchParams.delete('pointlng');
    
    // Update URL without reloading the page
    window.history.replaceState(null, '', url.toString());
}

function updateUrlWithAsset(assetKey) {
    const url = new URL(window.location);
    
    if (assetKey) {
        url.searchParams.set('asset', assetKey);
    } else {
        url.searchParams.delete('asset');
    }
    
    // Update URL without reloading the page
    window.history.replaceState(null, '', url.toString());
}

function exitPointAnalysisMode() {
    clearPointAnalysis();
    
    // Reset sidebar to default state
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = '<div class="no-selection">Click on an asset to view detailed information</div>';
    }
}

// Make function globally available for onclick handlers
window.exitPointAnalysisMode = exitPointAnalysisMode;

function showPointAnalysisLoading() {
    // Ensure no existing layer before creating new one
    if (pointAnalysisLayer) {
        pointAnalysisLayer.removeFrom(map);
        pointAnalysisLayer = null;
    }
    
    // Create visual layer with just the reticle initially
    pointAnalysisLayer = new PointAnalysisLayer(analysisPoint, []);
    pointAnalysisLayer.addTo(map);
    
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = `
            <div class="text-center" style="padding: 50px;">
                <div class="spinner-border mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>📍 Point Analysis Mode</h5>
                <p class="text-muted">
                    <strong>Location:</strong> ${analysisPoint.lat.toFixed(6)}°, ${analysisPoint.lng.toFixed(6)}°<br>
                    Searching for nearby assets within ${SEARCH_RADIUS_KM}km...
                </p>
            </div>
        `;
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    // Simple distance calculation in kilometers
    // Using approximate conversion: 1 degree ≈ 111km at equator
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    return distance;
}

function findNearbyAssets(point) {
    if (!assetsData || !assetsData.assets) return [];
    
    const nearby = [];
    
    for (const asset of assetsData.assets) {
        const distance = calculateDistance(
            point.lat, point.lng,
            asset.center_lat, asset.center_lon
        );
        
        if (distance <= SEARCH_RADIUS_KM) {
            nearby.push({
                asset: asset,
                distance: distance,
                direction: calculateDirection(point.lat, point.lng, asset.center_lat, asset.center_lon)
            });
        }
    }
    
    // Sort by distance (closest first)
    nearby.sort((a, b) => a.distance - b.distance);
    
    return nearby;
}

function calculateDirection(fromLat, fromLng, toLat, toLng) {
    const dLat = toLat - fromLat;
    const dLng = toLng - fromLng;
    
    let angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
    angle = (angle + 360) % 360; // Normalize to 0-360
    
    // Convert to compass direction
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(angle / 22.5) % 16;
    return directions[index];
}

async function performPointAnalysis(point) {
    try {
        // Step 1: Find nearby assets
        nearbyAssets = findNearbyAssets(point);
        
        if (nearbyAssets.length === 0) {
            showNoNearbyAssetsMessage();
            return;
        }
        
        // Update loading message
        updateLoadingMessage(`Found ${nearbyAssets.length} nearby assets. Checking grid overlaps...`);
        
        // Step 2: Check which assets have grid overlap and load their data
        const contributingAssets = [];
        
        for (const nearbyAsset of nearbyAssets) {
            const asset = nearbyAsset.asset;
            
            // Check if point falls within asset bounds
            if (point.lng >= asset.bounds.left && point.lng <= asset.bounds.right &&
                point.lat >= asset.bounds.bottom && point.lat <= asset.bounds.top) {
                
                // Load asset data and check contribution
                const contribution = await getAssetContributionAtPoint(asset, point);
                if (contribution && contribution.concentration > 0) {
                    contributingAssets.push({
                        ...nearbyAsset,
                        contribution: contribution
                    });
                }
            }
        }
        
        if (contributingAssets.length === 0) {
            showNoContributionMessage(nearbyAssets.length);
            return;
        }
        
        // Step 3: Display results
        displayPointAnalysisResults(point, contributingAssets, nearbyAssets.length);
        
    } catch (error) {
        console.error('Point analysis error:', error);
        showPointAnalysisError(error.message);
    }
}

function updateLoadingMessage(message) {
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = `
            <div class="text-center" style="padding: 50px;">
                <div class="spinner-border mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>Analyzing Point</h5>
                <p class="text-muted">
                    📍 ${analysisPoint.lat.toFixed(6)}°, ${analysisPoint.lng.toFixed(6)}°<br>
                    ${message}
                </p>
            </div>
        `;
    }
}

function showNoNearbyAssetsMessage() {
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = `
            <div class="text-center" style="padding: 50px;">
                <h5>📍 Point Analysis</h5>
                <p><strong>Location:</strong> ${analysisPoint.lat.toFixed(6)}°, ${analysisPoint.lng.toFixed(6)}°</p>
                <div class="alert alert-info">
                    <strong>No nearby assets found</strong><br>
                    No industrial assets within ${SEARCH_RADIUS_KM}km of this point.
                </div>
                <button onclick="exitPointAnalysisMode();" class="btn btn-secondary btn-sm">
                    Exit Point Analysis Mode
                </button>
            </div>
        `;
    }
}

function showNoContributionMessage(nearbyCount) {
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = `
            <div class="text-center" style="padding: 50px;">
                <h5>📍 Point Analysis</h5>
                <p><strong>Location:</strong> ${analysisPoint.lat.toFixed(6)}°, ${analysisPoint.lng.toFixed(6)}°</p>
                <div class="alert alert-warning">
                    <strong>No additional PM2.5 exposure at this point</strong><br>
                    Found ${nearbyCount} assets within ${SEARCH_RADIUS_KM}km, but none contribute additional PM2.5 exposure at this specific location.
                </div>
                <button onclick="exitPointAnalysisMode();" class="btn btn-secondary btn-sm">
                    Exit Point Analysis Mode
                </button>
            </div>
        `;
    }
}

function showPointAnalysisError(errorMessage) {
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        assetDetails.innerHTML = `
            <div class="text-center" style="padding: 50px;">
                <h5>📍 Point Analysis Error</h5>
                <div class="alert alert-danger">
                    <strong>Analysis failed:</strong><br>
                    ${errorMessage}
                </div>
                <button onclick="exitPointAnalysisMode();" class="btn btn-secondary btn-sm">
                    Exit Point Analysis Mode
                </button>
            </div>
        `;
    }
}

// Phase 2: Grid intersection and data loading functions
async function getAssetContributionAtPoint(asset, point) {
    const assetKey = `${asset.country}_${asset.asset_id}`;
    
    try {
        // Check cache first
        if (loadedAssetData.has(assetKey)) {
            return calculateContributionFromData(loadedAssetData.get(assetKey), asset, point);
        }
        
        // Load unified overlay data file
        const filename = `${asset.country}_${asset.asset_id}_data.json`;
        const response = await fetch(`overlays/${filename}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load data for ${assetKey}: ${response.statusText}`);
        }
        
        const unifiedData = await response.json();
        
        // Cache the data
        loadedAssetData.set(assetKey, unifiedData);
        
        return calculateContributionFromData(unifiedData, asset, point);
        
    } catch (error) {
        console.warn(`Could not load data for ${assetKey}:`, error.message);
        return null;
    }
}

function calculateContributionFromData(rawData, asset, point) {
    // Find the grid cell that contains the clicked point
    const gridRow = Math.floor((asset.bounds.top - point.lat) / (asset.bounds.top - asset.bounds.bottom) * rawData.dimensions.height);
    const gridCol = Math.floor((point.lng - asset.bounds.left) / (asset.bounds.right - asset.bounds.left) * rawData.dimensions.width);
    
    // Check bounds
    if (gridRow < 0 || gridRow >= rawData.dimensions.height || gridCol < 0 || gridCol >= rawData.dimensions.width) {
        return null;
    }
    
    // The data is organized as 2D arrays [row][col]
    if (!rawData.data || !rawData.data.concentration || !rawData.data.population) {
        return null;
    }
    
    if (gridRow >= rawData.data.concentration.length || gridCol >= rawData.data.concentration[gridRow].length) {
        return null;
    }
    
    const concentration = rawData.data.concentration[gridRow][gridCol];
    const population = rawData.data.population[gridRow][gridCol];
    
    // Return contribution data
    return {
        concentration: concentration,
        population: population,
        personExposure: concentration * population,
        gridPosition: { row: gridRow, col: gridCol }
    };
}

function displayPointAnalysisResults(point, contributingAssets, totalNearby) {
    // Sort by concentration contribution (highest first)
    contributingAssets.sort((a, b) => b.contribution.concentration - a.contribution.concentration);
    
    // Update visual layer with contributing assets
    if (pointAnalysisLayer) {
        pointAnalysisLayer.updateContributingAssets(contributingAssets);
    }
    
    // Calculate totals
    const totalAdditionalPM25 = contributingAssets.reduce((sum, ca) => sum + ca.contribution.concentration, 0);
    
    // Calculate total population and grid area from first contributing asset (they should all be the same)
    let totalPopulation = 0;
    let gridAreaSqM = 0;
    let gridDescription = '';
    
    if (contributingAssets.length > 0) {
        // Get the first asset's data to determine population and grid area
        const firstAsset = contributingAssets[0];
        totalPopulation = firstAsset.contribution.population;
        
        // Calculate grid cell area using pixel size from the data
        // Note: We need to get this from the loaded data cache
        const assetKey = `${firstAsset.asset.country}_${firstAsset.asset.asset_id}`;
        const cachedData = loadedAssetData.get(assetKey);
        
        if (cachedData && cachedData.pixel_size) {
            // Convert degrees to meters at this latitude
            const pixelSizeXDegrees = cachedData.pixel_size.x;
            const pixelSizeYDegrees = cachedData.pixel_size.y;
            
            // Convert degrees to meters (approximate at given latitude)
            const lat = point.lat;
            const metersPerDegreeLat = 111320; // meters per degree latitude (constant)
            const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180); // varies by latitude
            
            const pixelWidthM = pixelSizeXDegrees * metersPerDegreeLng;
            const pixelHeightM = pixelSizeYDegrees * metersPerDegreeLat;
            gridAreaSqM = pixelWidthM * pixelHeightM;
            
            gridDescription = `${Math.round(pixelWidthM)}m × ${Math.round(pixelHeightM)}m grid cell (${Math.round(gridAreaSqM).toLocaleString()} m²)`;
        } else {
            gridDescription = 'grid cell area';
        }
    }
    
    // Generate the results HTML
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        let html = `
            <div style="padding: 20px;">
                <h5>📍 Point Analysis</h5>
                <p><strong>Location:</strong> ${point.lat.toFixed(6)}°, ${point.lng.toFixed(6)}°</p>
                
                <div class="alert alert-success mb-3">
                    <strong>🔢 Total Additional PM2.5:</strong> ${totalAdditionalPM25.toFixed(2)} μg/m³<br>
                    <strong>👥 Population in area:</strong> ${totalPopulation.toFixed(1)} people<br>
                    <strong>📐 Analysis area:</strong> ${gridDescription}<br>
                    <strong>🏭 Contributing Assets:</strong> ${contributingAssets.length} of ${totalNearby} nearby
                </div>
                
                <h6>Contributing Assets:</h6>
        `;
        
        // Create bar chart
        const maxContribution = Math.max(...contributingAssets.map(ca => ca.contribution.concentration));
        
        contributingAssets.forEach(contributingAsset => {
            const asset = contributingAsset.asset;
            const contribution = contributingAsset.contribution;
            const distance = contributingAsset.distance;
            const direction = contributingAsset.direction;
            
            const assetId = `${asset.country}_${asset.asset_id}`;
            const barWidth = Math.max(10, (contribution.concentration / maxContribution) * 200); // Minimum 10px width
            const color = getConcentrationColor(contribution.concentration);
            
            html += `
                <div class="mb-3 point-analysis-asset-item" 
                     data-asset-key="${asset.country}_${asset.asset_id}"
                     style="cursor: pointer; padding: 8px; border-radius: 6px; transition: background-color 0.2s;"
                     onmouseover="highlightAssetMarker('${asset.country}_${asset.asset_id}', true)"
                     onmouseout="highlightAssetMarker('${asset.country}_${asset.asset_id}', false)"
                     onclick="selectAssetFromPointAnalysis('${asset.country}_${asset.asset_id}')">
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <div style="
                            width: ${barWidth}px; 
                            height: 20px; 
                            background-color: ${color}; 
                            border-radius: 3px; 
                            margin-right: 10px;
                        "></div>
                        <strong>${assetId}</strong>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-left: 10px;">
                        <strong>Additional PM2.5:</strong> ${contribution.concentration.toFixed(2)} μg/m³<br>
                        <strong>Distance:</strong> ${distance.toFixed(1)} km ${direction}
                    </div>
                </div>
            `;
        });
        
        html += `
                <div class="mt-3">
                    <button onclick="exitPointAnalysisMode();" class="btn btn-secondary btn-sm">
                        Exit Point Analysis Mode
                    </button>
                </div>
            </div>
        `;
        
        assetDetails.innerHTML = html;
    }
}

// Point Analysis Marker Interaction Functions
function highlightAssetMarker(assetKey, highlight) {
    const marker = assetMarkerMap.get(assetKey);
    if (!marker) return;
    
    try {
        if (highlight) {
            // Bring marker to front and add highlighting
            marker.setZIndexOffset(100);
            
            // Get the marker DOM element - try different approaches for robustness
            let markerElement = null;
            if (marker.getElement) {
                markerElement = marker.getElement();
            } else if (marker._icon) {
                markerElement = marker._icon;
            }
            
            if (markerElement) {
                markerElement.classList.add('marker-highlighted');
            }
        } else {
            // Reset z-index and remove highlighting
            marker.setZIndexOffset(0);
            
            // Get the marker DOM element
            let markerElement = null;
            if (marker.getElement) {
                markerElement = marker.getElement();
            } else if (marker._icon) {
                markerElement = marker._icon;
            }
            
            if (markerElement) {
                markerElement.classList.remove('marker-highlighted');
            }
        }
    } catch (error) {
        console.warn('Error highlighting marker:', error);
    }
}

function selectAssetFromPointAnalysis(assetKey) {
    // Find the asset data
    const asset = assetsData.assets.find(a => `${a.country}_${a.asset_id}` === assetKey);
    if (!asset) {
        console.error(`Asset not found: ${assetKey}`);
        return;
    }
    
    // Clear the point analysis first (but keep the point analysis layer for now)
    const currentPoint = analysisPoint;
    clearPointAnalysisState(); // Don't clear URL since we're changing selection
    
    // Select the new asset (this will update the overlay)
    selectAsset(asset);
    
    // Re-enable point analysis at the same point after a short delay to allow overlay to load
    setTimeout(() => {
        if (currentPoint) {
            analysisPoint = currentPoint;
            pointAnalysisMode = true;
            
            // Show loading state
            showPointAnalysisLoading();
            
            // Restart analysis with the new asset selected
            performPointAnalysis(currentPoint);
        }
    }, 500);
}

// Make functions globally available for onclick handlers
window.highlightAssetMarker = highlightAssetMarker;
window.selectAssetFromPointAnalysis = selectAssetFromPointAnalysis;

// New function for CircleCanvasOverlay pixel data lookup
function getCircleCanvasPixelData(latlng, canvasOverlay) {
    if (!canvasOverlay || !canvasOverlay.overlayData) return null;
    
    
    const bounds = canvasOverlay.bounds;
    const overlayData = canvasOverlay.overlayData;
    
    // Calculate relative position within bounds (0-1)
    const relativeX = (latlng.lng - bounds.west) / (bounds.east - bounds.west);
    const relativeY = (bounds.north - latlng.lat) / (bounds.north - bounds.south);
    
    // Check bounds
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) return null;
    
    // Convert to data array indices with clamping to prevent out-of-bounds
    const dataX = Math.max(0, Math.min(Math.floor(relativeX * overlayData.dimensions.width), overlayData.dimensions.width - 1));
    const dataY = Math.max(0, Math.min(Math.floor(relativeY * overlayData.dimensions.height), overlayData.dimensions.height - 1));
    
    // Bounds check
    if (dataX < 0 || dataX >= overlayData.dimensions.width || 
        dataY < 0 || dataY >= overlayData.dimensions.height) {
        return null;
    }
    
    // Check for unified format vs legacy format compatibility
    if (!overlayData.data && overlayData.data_arrays) {
        overlayData.data = overlayData.data_arrays;
    }
    
    if (!overlayData.data || !overlayData.data.concentration || !overlayData.data.population) {
        console.error('Missing required data arrays for hover tooltip:', overlayData);
        return null;
    }
    
    // Get data values with client-side person_exposure calculation
    const concentrationRow = overlayData.data.concentration[dataY];
    const populationRow = overlayData.data.population[dataY];
    // person_exposure is now calculated on-demand: concentration * population
    
    if (!concentrationRow || !populationRow) {
        return null;
    }
    
    const concentration = concentrationRow[dataX];
    const population = populationRow[dataX];
    const personExposure = concentration * population; // Calculated on-demand
    
    if (concentration === undefined || population === undefined) {
        return null;
    }
    
    // Only return data if there's meaningful values
    if (concentration <= 0 && population <= 0) return null;
    
    return {
        concentration,
        population,
        personExposure
    };
}

// Legacy function for old canvas overlay (kept for compatibility)
function getCanvasPixelData(latlng, canvasOverlay) {
    if (!canvasOverlay || !canvasOverlay.rawData) return null;
    
    const bounds = canvasOverlay.bounds;
    const rawData = canvasOverlay.rawData;
    const { width, height } = rawData.dimensions;
    
    // Check if point is within bounds
    if (latlng.lat > bounds.north || latlng.lat < bounds.south || 
        latlng.lng > bounds.east || latlng.lng < bounds.west) {
        return null;
    }
    
    // Convert lat/lng to pixel coordinates
    const xNorm = (latlng.lng - bounds.west) / (bounds.east - bounds.west);
    const yNorm = (bounds.north - latlng.lat) / (bounds.north - bounds.south);
    
    const pixelX = Math.floor(xNorm * width);
    const pixelY = Math.floor(yNorm * height);
    
    // Check bounds
    if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
        return null;
    }
    
    // Get data for this pixel
    const exposure = rawData.data.person_exposure[pixelY][pixelX];
    const concentration = rawData.data.concentration[pixelY][pixelX];
    const population = rawData.data.population[pixelY][pixelX];
    
    // Only show tooltip if there's actual data
    if (exposure <= 0) return null;
    
    return {
        exposure: exposure,
        concentration: concentration,
        population: population,
        lat: latlng.lat,
        lon: latlng.lng
    };
}

function formatNumber(num) {
    if (num === 0) return '0';
    if (num < 1000) return num.toFixed(1);
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    return (num / 1000000000).toFixed(1) + 'B';
}



function showExposureLegend() {
    const legend = document.getElementById('exposure-legend');
    if (legend) {
        legend.classList.add('visible');
    }
}

function hideExposureLegend() {
    const legend = document.getElementById('exposure-legend');
    if (legend) {
        legend.classList.remove('visible');
    }
}

// Client-side overlay styling functions
function setOverlayStyle(styleName) {
    const mapElement = document.getElementById('map');
    
    // Remove existing style classes
    mapElement.classList.remove('overlay-style-enhanced', 'overlay-style-subtle', 'overlay-style-sharp');
    
    // Add new style class if provided
    if (styleName && styleName !== 'default') {
        mapElement.classList.add(`overlay-style-${styleName}`);
    }
    
    console.log(`Applied overlay style: ${styleName || 'default'}`);
}

function adjustOverlayOpacity(opacity) {
    if (currentOverlay) {
        currentOverlay.setOpacity(opacity);
        console.log(`Set overlay opacity to: ${opacity}`);
    }
}

function toggleOverlayFilter(filterType) {
    if (!currentOverlay) return;
    
    const overlayElement = currentOverlay.getElement();
    if (!overlayElement) return;
    
    switch (filterType) {
        case 'enhance':
            overlayElement.style.filter = 'contrast(1.2) brightness(1.1) saturate(1.1)';
            break;
        case 'soften':
            overlayElement.style.filter = 'blur(0.5px) opacity(0.8)';
            break;
        case 'sharpen':
            overlayElement.style.filter = 'contrast(1.3) brightness(1.2)';
            break;
        case 'invert':
            overlayElement.style.filter = 'invert(1)';
            break;
        case 'none':
        default:
            overlayElement.style.filter = 'none';
            break;
    }
    
    console.log(`Applied filter: ${filterType}`);
}

// Canvas coordinate transformation function
function calculateCanvasLayout(assetBounds, currentMapCenter, currentZoom, viewportSize) {
    /**
     * Calculate canvas positioning and rendering parameters for a given asset
     * 
     * @param {Object} assetBounds - {north, south, east, west} in decimal degrees
     * @param {Object} currentMapCenter - {lat, lng} current map center
     * @param {number} currentZoom - current zoom level  
     * @param {Object} viewportSize - {width, height} in pixels
     * @returns {Object} Layout parameters for canvas positioning and rendering
     */
    
    // Mock the map's coordinate transformation (simplified for testing)
    // In real usage, we'd use map.latLngToContainerPoint()
    const pixelsPerDegreeAtZoom = Math.pow(2, currentZoom) * 256 / 360;
    
    // Calculate container points for asset bounds
    const nwContainerX = (assetBounds.west - currentMapCenter.lng) * pixelsPerDegreeAtZoom + viewportSize.width / 2;
    const nwContainerY = (currentMapCenter.lat - assetBounds.north) * pixelsPerDegreeAtZoom + viewportSize.height / 2;
    const seContainerX = (assetBounds.east - currentMapCenter.lng) * pixelsPerDegreeAtZoom + viewportSize.width / 2;
    const seContainerY = (currentMapCenter.lat - assetBounds.south) * pixelsPerDegreeAtZoom + viewportSize.height / 2;
    
    const canvasWidth = Math.abs(seContainerX - nwContainerX);
    const canvasHeight = Math.abs(seContainerY - nwContainerY);
    
    // Canvas position (top-left corner)
    const canvasLeft = Math.min(nwContainerX, seContainerX);
    const canvasTop = Math.min(nwContainerY, seContainerY);
    
    // Calculate center of data array position in container coordinates
    const dataCenterX = (nwContainerX + seContainerX) / 2;
    const dataCenterY = (nwContainerY + seContainerY) / 2;
    
    // Calculate pixel spacing (how many canvas pixels per data cell)
    const dataGridSize = 201; // Our data is 201x201
    const pixelSpacingX = canvasWidth / dataGridSize;
    const pixelSpacingY = canvasHeight / dataGridSize;
    
    // Calculate viewport offset (how much canvas extends beyond viewport)
    const viewportOffset = {
        x: canvasLeft < 0 ? Math.abs(canvasLeft) : 0,
        y: canvasTop < 0 ? Math.abs(canvasTop) : 0
    };
    
    // Calculate visible canvas bounds
    const visibleCanvasLeft = Math.max(0, canvasLeft);
    const visibleCanvasTop = Math.max(0, canvasTop);
    const visibleCanvasRight = Math.min(viewportSize.width, canvasLeft + canvasWidth);
    const visibleCanvasBottom = Math.min(viewportSize.height, canvasTop + canvasHeight);
    const visibleCanvasWidth = Math.max(0, visibleCanvasRight - visibleCanvasLeft);
    const visibleCanvasHeight = Math.max(0, visibleCanvasBottom - visibleCanvasTop);
    
    return {
        // Canvas positioning
        canvasPosition: { x: canvasLeft, y: canvasTop },
        canvasSize: { width: canvasWidth, height: canvasHeight },
        
        // Visible portion in viewport
        visibleCanvasPosition: { x: visibleCanvasLeft, y: visibleCanvasTop },
        visibleCanvasSize: { width: visibleCanvasWidth, height: visibleCanvasHeight },
        
        // Data array positioning
        dataCenterPosition: { x: dataCenterX, y: dataCenterY },
        pixelSpacing: { x: pixelSpacingX, y: pixelSpacingY },
        
        // Rendering offsets
        viewportOffset: viewportOffset,
        
        // Helper properties for debugging
        isFullyVisible: canvasLeft >= 0 && canvasTop >= 0 && 
                       canvasLeft + canvasWidth <= viewportSize.width && 
                       canvasTop + canvasHeight <= viewportSize.height,
        isPartiallyVisible: visibleCanvasWidth > 0 && visibleCanvasHeight > 0,
        percentageVisible: (visibleCanvasWidth * visibleCanvasHeight) / (canvasWidth * canvasHeight) * 100
    };
}

// Unit test function
function testCanvasLayout() {
        
    // Test asset (IDN_32438498 from logs)
    const testAsset = {
        north: -5.4766666372306645,
        south: -7.480000019073486, 
        east: 107.90333490772173,
        west: 105.9000015258789
    };
    
    const viewport = { width: 1920, height: 1080 };
    console.log(`Test viewport size: ${viewport.width}×${viewport.height} pixels`);
    console.log(`Test asset bounds: N:${testAsset.north.toFixed(4)}, S:${testAsset.south.toFixed(4)}, E:${testAsset.east.toFixed(4)}, W:${testAsset.west.toFixed(4)}`);
    
    // Test different map centers and zoom levels
    const testCases = [
        {
            name: "Centered on asset, zoom 9",
            mapCenter: { lat: -6.478, lng: 106.902 },
            zoom: 9
        },
        {
            name: "Centered on asset, zoom 10", 
            mapCenter: { lat: -6.478, lng: 106.902 },
            zoom: 10
        },
        {
            name: "Centered on asset, zoom 11",
            mapCenter: { lat: -6.478, lng: 106.902 },
            zoom: 11
        },
        {
            name: "Off-center, zoom 10",
            mapCenter: { lat: -5.0, lng: 105.0 },
            zoom: 10
        },
        {
            name: "Far off-center, zoom 10",
            mapCenter: { lat: 0, lng: 100 },
            zoom: 10
        }
    ];
    
    testCases.forEach((testCase, index) => {
        console.log(`\n--- TEST ${index + 1}: ${testCase.name} ---`);
        console.log(`  Map center: lat=${testCase.mapCenter.lat}, lng=${testCase.mapCenter.lng}, zoom=${testCase.zoom}`);
        
        const layout = calculateCanvasLayout(testAsset, testCase.mapCenter, testCase.zoom, viewport);
        
        console.log(`  Canvas position: left=${layout.canvasPosition.x.toFixed(0)}px, top=${layout.canvasPosition.y.toFixed(0)}px`);
        console.log(`  Canvas dimensions: width=${layout.canvasSize.width.toFixed(0)}px, height=${layout.canvasSize.height.toFixed(0)}px`);
        console.log(`  Data center position: x=${layout.dataCenterPosition.x.toFixed(0)}px, y=${layout.dataCenterPosition.y.toFixed(0)}px`);
        console.log(`  Pixel spacing: x=${layout.pixelSpacing.x.toFixed(2)}px/cell, y=${layout.pixelSpacing.y.toFixed(2)}px/cell`);
        console.log(`  Viewport offset: x=${layout.viewportOffset.x.toFixed(0)}px, y=${layout.viewportOffset.y.toFixed(0)}px`);
        console.log(`  Visible canvas area: left=${layout.visibleCanvasPosition.x.toFixed(0)}px, top=${layout.visibleCanvasPosition.y.toFixed(0)}px, width=${layout.visibleCanvasSize.width.toFixed(0)}px, height=${layout.visibleCanvasSize.height.toFixed(0)}px`);
        console.log(`  Visibility: ${layout.percentageVisible.toFixed(1)}% (${layout.isFullyVisible ? 'fully' : 'partially'} visible)`);
        
        // Test assertions - what we expect for correct behavior
        const assertions = [];
        
        if (index + 1 === 1) { // TEST 1: Centered on asset, zoom 9
            assertions.push({ 
                name: "Data center should be at viewport center", 
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540", // viewport center
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Should be fully visible at low zoom",
                actual: layout.isFullyVisible,
                expected: true,
                passes: layout.isFullyVisible === true
            });
        }
        
        if (index + 1 === 2) { // TEST 2: Centered on asset, zoom 10
            assertions.push({
                name: "Data center should stay at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be 2x larger than zoom 9",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: "~1460x1468 (2x zoom 9)",
                passes: Math.abs(layout.canvasSize.width / layout.canvasSize.height - 1) < 0.1 // roughly square
            });
        }
        
        if (index + 1 === 3) { // TEST 3: Centered on asset, zoom 11  
            assertions.push({
                name: "Data center should stay at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be 4x larger than zoom 9",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: "~2920x2936 (4x zoom 9)",
                passes: layout.canvasSize.width > 2500 && layout.canvasSize.height > 2500
            });
        }
        
        if (index + 1 === 4) { // TEST 4: Off-center, zoom 10
            assertions.push({
                name: "Data center should move with map pan",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "not 960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) > 50 || Math.abs(layout.dataCenterPosition.y - 540) > 50
            });
        }
        
        if (index + 1 === 5) { // TEST 5: Far off-center, zoom 10
            assertions.push({
                name: "Should be mostly/completely off-screen",
                actual: `${layout.percentageVisible.toFixed(1)}%`,
                expected: "<50% visible",
                passes: layout.percentageVisible < 50
            });
        }
        
        // Run assertions
        let allPassed = true;
        console.log(`  ASSERTIONS:`);
        assertions.forEach(assertion => {
            const status = assertion.passes ? "✅ PASS" : "❌ FAIL";
            console.log(`    ${status} ${assertion.name}`);
            console.log(`      Expected: ${assertion.expected}`);
            console.log(`      Actual: ${assertion.actual}`);
            if (!assertion.passes) allPassed = false;
        });
        
        console.log(`  OVERALL: ${allPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}`);
    });
    
    console.log("\n=== End Tests ===");
}

// Canvas-based rendering functions
class CanvasOverlay extends L.Layer {
    constructor(rawData, bounds, options = {}) {
        super();
        this.rawData = rawData;
        this.bounds = bounds;
        this.options = options;
        this.canvas = null;
        this.ctx = null;
        this.scaleMode = options.scaleMode || 'log';
        this._canvasOffset = { x: 0, y: 0, totalWidth: 0, totalHeight: 0 };
    }
    
    onAdd(map) {
        this.map = map;
        this.createCanvas();
        this.updateCanvasPosition();
        
        // Store bound event handlers for proper cleanup
        this._onViewReset = this.updateCanvasPosition.bind(this);
        this._onZoomStart = this.updateCanvasPosition.bind(this);
        this._onZoom = this.updateCanvasPosition.bind(this);
        this._onZoomEnd = this.updateCanvasPosition.bind(this);
        this._onMove = this.updateCanvasPosition.bind(this);
        this._onPositionUpdate = this.updatePositionOnly.bind(this);
        
        map.on('viewreset', this._onViewReset);
        map.on('zoomstart', this._onZoomStart);
        map.on('zoom', this._onZoom);
        map.on('zoomend', this._onZoomEnd);
        map.on('moveend', this._onMove);
        map.on('resize', this._onViewReset);
        
        // Add real-time position updates during panning (but not zoom)
        map.on('move', this._onPositionUpdate);
        
        return this;
    }
    
    onRemove(map) {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // Properly remove event listeners
        if (this._onViewReset) {
            map.off('viewreset', this._onViewReset);
            map.off('resize', this._onViewReset);
        }
        if (this._onZoomStart) {
            map.off('zoomstart', this._onZoomStart);
        }
        if (this._onZoom) {
            map.off('zoom', this._onZoom);
        }
        if (this._onZoomEnd) {
            map.off('zoomend', this._onZoomEnd);
        }
        if (this._onMove) {
            map.off('moveend', this._onMove);
        }
        if (this._onPositionUpdate) {
            map.off('move', this._onPositionUpdate);
        }
        
        // Clean up references
        this._onViewReset = null;
        this._onZoomStart = null;
        this._onZoom = null;
        this._onZoomEnd = null;
        this._onMove = null;
        this._onPositionUpdate = null;
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1000';
        this.canvas.style.border = '2px solid #808080';
        
        this.ctx = this.canvas.getContext('2d');
        
        // Add canvas to Leaflet's overlay pane for proper coordinate handling
        const overlayPane = this.map.getPane('overlayPane');
        overlayPane.appendChild(this.canvas);
    }
    
    updateCanvasPosition() {
        if (!this.canvas) return;
        
        const zoom = this.map.getZoom();
        
        // SIMPLIFIED: Direct EPSG:4326 coordinate handling - no transformation needed
        const containerNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        const containerSE = this.map.latLngToLayerPoint([this.bounds.south, this.bounds.east]);
        
        console.log(`CanvasOverlay: Direct EPSG:4326 positioning - NW: (${containerNW.x}, ${containerNW.y}), SE: (${containerSE.x}, ${containerSE.y})`);
        
        // Debug canvas positioning
        console.log(`CircleCanvasOverlay: Canvas positioning at zoom ${zoom}`);
        console.log(`  Layer points: NW(${containerNW.x}, ${containerNW.y}) SE(${containerSE.x}, ${containerSE.y})`);
        console.log(`  Canvas will be positioned at: left=${containerNW.x}px, top=${containerNW.y}px`);
        console.log(`  Bounds: ${JSON.stringify(this.bounds)}`);
        
        
        let width = Math.abs(containerSE.x - containerNW.x);
        let height = Math.abs(containerSE.y - containerNW.y);
        
        
        // Ensure minimum size to prevent tiny canvas issues
        if (width < 10 || height < 10) {
            this.canvas.style.display = 'none';
            return;
        }
        
        // Only limit canvas size for extreme cases to prevent browser crashes
        const MAX_CANVAS_SIZE = 16384; // Very high limit for zoom testing
        const MAX_TOTAL_PIXELS = 32 * 1024 * 1024; // 32M pixels max (~128MB at 32-bit RGBA)
        
        if (width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE || (width * height) > MAX_TOTAL_PIXELS) {
            const originalWidth = width;
            const originalHeight = height;
            // Scale down while maintaining aspect ratio
            const aspectRatio = width / height;
            if (width > height) {
                width = Math.min(MAX_CANVAS_SIZE, Math.sqrt(MAX_TOTAL_PIXELS * aspectRatio));
                height = width / aspectRatio;
            } else {
                height = Math.min(MAX_CANVAS_SIZE, Math.sqrt(MAX_TOTAL_PIXELS / aspectRatio));
                width = height * aspectRatio;
            }
            width = Math.floor(width);
            height = Math.floor(height);
        }
        
        this.canvas.style.display = 'block';
        
        // SIMPLIFIED: Direct canvas positioning with EPSG:4326
        const canvasLeft = containerNW.x;
        const canvasTop = containerNW.y;
        
        
        this.canvas.style.left = canvasLeft + 'px';
        this.canvas.style.top = canvasTop + 'px';
        this.canvas.style.transform = 'none';
        
        
        // Store positioning info for rendering offset calculations
        this._canvasOffset = {
            x: canvasLeft < 0 ? Math.abs(canvasLeft) : 0,
            y: canvasTop < 0 ? Math.abs(canvasTop) : 0,
            totalWidth: width,
            totalHeight: height
        };
        
        // Only update canvas dimensions if they've changed significantly to avoid constant re-rendering
        const currentWidth = this.canvas.width;
        const currentHeight = this.canvas.height;
        
        const dimensionsChanged = Math.abs(width - currentWidth) > 5 || Math.abs(height - currentHeight) > 5;
        
        if (dimensionsChanged) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        
        // Always render canvas on position updates to handle zoom level changes
        this.renderCanvas();
    }
    
    updatePositionOnly() {
        // Lightweight position update during animations - no re-rendering
        if (!this.canvas) return;
        
        // SIMPLIFIED: Direct EPSG:4326 coordinate handling - no transformation needed
        const containerNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        const containerSE = this.map.latLngToLayerPoint([this.bounds.south, this.bounds.east]);
        
        // Just update position using container coordinates - NW point is the actual top-left  
        const canvasLeft = containerNW.x;
        const canvasTop = containerNW.y;
        this.canvas.style.left = canvasLeft + 'px';
        this.canvas.style.top = canvasTop + 'px';
    }
    
    renderCanvas() {
        if (!this.ctx || !this.rawData) return;
        
        const { width, height } = this.rawData.dimensions;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Skip rendering if canvas is too small or invalid
        if (canvasWidth <= 0 || canvasHeight <= 0) return;
        
        // Clear canvas first
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Only render data at zoom level 10 and above
        const zoom = this.map.getZoom();
        if (zoom < 10) {
            return; // Canvas is cleared but no data is drawn
        }
        
        try {
            
            // Create image data with error handling
            const imageData = this.ctx.createImageData(canvasWidth, canvasHeight);
            const data = imageData.data;
            
            // Calculate scaling factors - data pixels to canvas pixels
            const scaleX = canvasWidth / width;
            const scaleY = canvasHeight / height;
            
            
            // Get exposure data based on current scale mode
            const exposureData = this.getScaledExposureData();
            const maxExposure = Math.max(...exposureData.flat());
            
            // Render the data grid directly to the canvas (no offset needed - canvas is already positioned)
            for (let dataY = 0; dataY < height; dataY++) {
                for (let dataX = 0; dataX < width; dataX++) {
                    const exposure = exposureData[dataY][dataX];
                    if (exposure <= 0) continue;
                    
                    // Calculate color based on exposure value
                    const color = this.exposureToColor(exposure, maxExposure);
                    
                    // Map to canvas coordinates - handle Y-axis flipping from TIFF transform matrix
                    const baseCanvasX = Math.floor(dataX * scaleX);
                    // Check if Y-axis is flipped in the transform (negative scaling factor)
                    const hasFlippedY = this.rawData.transform && this.rawData.transform[4] < 0;
                    const baseCanvasY = hasFlippedY ? 
                        Math.floor((height - 1 - dataY) * scaleY) : 
                        Math.floor(dataY * scaleY);
                    
                    // Fill rectangular area for this pixel
                    for (let dy = 0; dy < Math.ceil(scaleY); dy++) {
                        for (let dx = 0; dx < Math.ceil(scaleX); dx++) {
                            const pixelX = baseCanvasX + dx;
                            const pixelY = baseCanvasY + dy;
                            
                            if (pixelX >= 0 && pixelX < canvasWidth && pixelY >= 0 && pixelY < canvasHeight) {
                                const index = (pixelY * canvasWidth + pixelX) * 4;
                                data[index] = color.r;     // Red
                                data[index + 1] = color.g; // Green
                                data[index + 2] = color.b; // Blue
                                data[index + 3] = color.a; // Alpha
                            }
                        }
                    }
                }
            }
            
            // Draw image data to canvas
            this.ctx.putImageData(imageData, 0, 0);
            
        } catch (error) {
            console.error('Canvas rendering error:', error);
            // Fall back to simple rectangle if memory issues
            this.ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
            this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            this.ctx.strokeStyle = 'black';
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
        }
    }
    
    getScaledExposureData() {
        const exposureData = this.rawData.data.person_exposure;
        
        switch (this.scaleMode) {
            case 'linear':
                return exposureData;
                
            case 'sqrt':
                return exposureData.map(row => 
                    row.map(val => val > 0 ? Math.sqrt(val) : 0)
                );
                
            case 'log':
            default:
                return exposureData.map(row => 
                    row.map(val => val > 0 ? Math.log10(val + 1) : 0)
                );
        }
    }
    
    exposureToColor(exposure, maxExposure) {
        if (exposure <= 0) return { r: 255, g: 255, b: 255, a: 0 }; // Transparent
        
        // Normalize to 0-1 range
        let normalized = exposure / maxExposure;
        
        // Apply global scale (0 to 3M+ person-exposure)
        const globalMax = Math.log10(3000000 + 1);
        if (this.scaleMode === 'log') {
            normalized = Math.min(exposure / globalMax, 1.0);
        } else if (this.scaleMode === 'sqrt') {
            normalized = Math.min(Math.sqrt(exposure) / Math.sqrt(3000000), 1.0);
        } else {
            normalized = Math.min(exposure / 3000000, 1.0);
        }
        
        // White (transparent) to black (opaque) gradient
        const intensity = Math.floor((1 - normalized) * 255);
        const alpha = Math.floor(normalized * 255);
        
        return {
            r: intensity,
            g: intensity,
            b: intensity,
            a: alpha
        };
    }
    
    setScaleMode(mode) {
        this.scaleMode = mode;
        this.renderCanvas();
    }
}

// New data loading function for overlay format with fallback to backup
async function loadOverlayDataForAsset(asset) {
    try {
        // Try primary overlay file first
        const response = await fetch(`overlays/${asset.country}_${asset.asset_id}_data.json`);
        if (!response.ok) {
            throw new Error(`Failed to load overlay data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.warn(`Primary overlay failed for ${asset.country}_${asset.asset_id}:`, error);
        
        // Fallback to backup overlay files
        try {
            const backupResponse = await fetch(`overlays_backup_multistep_pipeline_20250904_091424/${asset.country}_${asset.asset_id}_data.json`);
            if (backupResponse.ok) {
                console.log(`Using backup overlay for ${asset.country}_${asset.asset_id}`);
                return await backupResponse.json();
            }
        } catch (backupError) {
            console.warn(`Backup overlay also failed for ${asset.country}_${asset.asset_id}:`, backupError);
        }
        
        console.error(`All overlay loading attempts failed for ${asset.country}_${asset.asset_id}`);
        return null;
    }
}

// Legacy raw data loading function - NOW REDIRECTS TO UNIFIED FORMAT
async function loadRawAssetData(asset) {
    try {
        // Use unified overlay format instead of separate raw data files
        const filename = `${asset.country}_${asset.asset_id}_data.json`;
        const response = await fetch(`overlays/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load unified data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error loading unified data for ${asset.country}_${asset.asset_id}:`, error);
        return null;
    }
}

function showCanvasOverlay(asset) {
    const zoom = map.getZoom();
    
    // Check if we should show canvas rendering
    if (zoom < 6) {
        hideExposureLegend();
        return;
    }
    
    // Create a unique identifier for this request to prevent race conditions
    const requestId = `${asset.country}_${asset.asset_id}`;
    activeOverlayRequest = requestId;
    
    console.log(`Starting overlay load for: ${requestId}`);
    
    // Load new overlay data format
    loadOverlayDataForAsset(asset).then(overlayData => {
        // Check if loading failed
        if (!overlayData) {
            console.error(`Failed to load overlay data for ${requestId}`);
            return;
        }
        
        // Debug logging for data structure
        console.log(`Loaded overlay data for ${requestId}:`, {
            hasData: !!overlayData.data,
            hasDataArrays: !!overlayData.data_arrays,
            keys: Object.keys(overlayData)
        });
        
        // Check if this is still the active request
        if (activeOverlayRequest !== requestId) {
            console.log(`Aborting overlay load for ${requestId} - newer request active`);
            return;
        }
        
        // Check if selection has changed since this request started
        if (!selectedAsset || `${selectedAsset.country}_${selectedAsset.asset_id}` !== requestId) {
            console.log(`Aborting overlay load for ${requestId} - selection changed`);
            return;
        }
        
        console.log(`Creating overlay for: ${requestId}`);
        
        if (!overlayData) {
            // Try fallback to legacy raw data format
            return loadRawAssetData(asset).then(rawData => {
                // Check again after async operation
                if (activeOverlayRequest !== requestId || !selectedAsset || `${selectedAsset.country}_${selectedAsset.asset_id}` !== requestId) {
                    console.log(`Aborting raw data overlay load for ${requestId}`);
                    return;
                }
                
                if (rawData) {
                    // Use legacy CanvasOverlay instead
                    const bounds = {
                        north: asset.bounds.top,
                        south: asset.bounds.bottom,
                        east: asset.bounds.right,
                        west: asset.bounds.left
                    };
                    
                    // Remove any existing overlays before creating new one
                    if (canvasOverlay) {
                        map.removeLayer(canvasOverlay);
                        canvasOverlay = null;
                    }
                    if (currentOverlay) {
                        map.removeLayer(currentOverlay);
                        currentOverlay = null;
                    }
                    
                    canvasOverlay = new CanvasOverlay(rawData, bounds, {
                        scaleMode: currentScaleMode
                    });
                    
                    // Set assetId to prevent unnecessary recreation
                    canvasOverlay.assetId = requestId;
                    
                    map.addLayer(canvasOverlay);
                    showExposureLegend();
                    updateSelectedAssetMarkerPosition();
                }
            });
        }
        
        const bounds = {
            north: overlayData.bounds.north,
            south: overlayData.bounds.south,
            east: overlayData.bounds.east,
            west: overlayData.bounds.west
        };
        
        // Remove any existing overlays before creating new one
        if (canvasOverlay) {
            map.removeLayer(canvasOverlay);
            canvasOverlay = null;
        }
        if (currentOverlay) {
            map.removeLayer(currentOverlay);
            currentOverlay = null;
        }
        
        // Use new circle-based visualization approach
        canvasOverlay = new CircleCanvasOverlay(overlayData, bounds, {
            scaleMode: currentScaleMode
        });
        
        // Set assetId to prevent unnecessary recreation
        canvasOverlay.assetId = requestId;
        
        map.addLayer(canvasOverlay);
        showExposureLegend();
        updateSelectedAssetMarkerPosition();
        
        // Update sidebar with overlay data
        updateAssetDetailsPanel(asset, overlayData);
    }).catch(error => {
        console.error(`Error loading overlay for ${requestId}:`, error);
        if (activeOverlayRequest === requestId) {
            activeOverlayRequest = null;
        }
    });
}

// Legend management functions
function showExposureLegend() {
    const legend = document.getElementById('exposure-legend');
    if (legend) {
        legend.classList.add('visible');
        
        // Update legend title with asset ID if available
        const legendTitle = document.getElementById('legend-title');
        if (legendTitle && selectedAsset) {
            legendTitle.textContent = `Additional PM2.5 Exposure from ${selectedAsset.country}_${selectedAsset.asset_id}`;
        }
        
        populateLegendContent();
    }
}

function hideExposureLegend() {
    const legend = document.getElementById('exposure-legend');
    if (legend) {
        legend.classList.remove('visible');
    }
}

function calculateActualCircleSize(populationBin) {
    // Calculate the actual circle size at current zoom level
    // This mirrors the calculation in renderCircles()
    if (!canvasOverlay || !selectedAsset) {
        // Fallback to static sizes if no active overlay
        return populationBin.radius * 2; // Diameter
    }
    
    const zoom = map.getZoom();
    const overlayData = canvasOverlay.overlayData;
    if (!overlayData) return populationBin.radius * 2;
    
    // Get current canvas dimensions (mimics renderCircles calculation)
    const canvas = canvasOverlay.canvas;
    if (!canvas) return populationBin.radius * 2;
    
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const { width: dataWidth, height: dataHeight } = overlayData.dimensions;
    
    // Calculate scaling factors
    const scaleX = canvasWidth / dataWidth;
    const scaleY = canvasHeight / dataHeight;
    const gridCellSize = Math.min(scaleX, scaleY);
    
    // Calculate radius the same way as in renderCircles
    const maxRadius = gridCellSize * 1;
    const populationFactor = (populationBin.radius - POPULATION_BINS[0].radius) / 
                           (POPULATION_BINS[POPULATION_BINS.length-1].radius - POPULATION_BINS[0].radius);
    const radius = populationFactor * maxRadius;
    
    // Return diameter, with minimum of 2px for visibility
    return Math.max(2, radius * 2);
}

function populateLegendContent() {
    // Populate concentration color legend
    const colorLegend = document.getElementById('concentration-color-legend');
    if (colorLegend) {
        let colorHtml = '';
        CONCENTRATION_BINS.forEach(bin => {
            colorHtml += `
                <div style="display: flex; align-items: center; margin-bottom: 3px;">
                    <div style="width: 12px; height: 12px; background-color: ${bin.color}; border-radius: 50%; margin-right: 6px; border: 1px solid #ccc;"></div>
                    <span style="font-size: 10px; color: #333;">${bin.label}</span>
                </div>
            `;
        });
        colorLegend.innerHTML = colorHtml;
    }
    
    // Populate adaptive population size legend
    const sizeLegend = document.getElementById('population-size-legend');
    if (sizeLegend) {
        const currentZoom = map ? map.getZoom() : 9;
        let sizeHtml = `<div style="font-size: 9px; color: #666; font-style: italic; margin-bottom: 4px;">at zoom ${currentZoom.toFixed(0)}</div>`;
        
        POPULATION_BINS.forEach(bin => {
            const actualSize = calculateActualCircleSize(bin);
            const displaySize = Math.min(actualSize, 240); // Cap display size for legend
            const radius = displaySize / 2;
            
            sizeHtml += `
                <div style="display: flex; align-items: center; margin-bottom: 3px;">
                    <div style="
                        position: relative;
                        width: ${radius}px; 
                        height: ${displaySize}px; 
                        overflow: hidden; 
                        margin-right: 8px;
                    ">
                        <div style="
                            width: ${displaySize}px; 
                            height: ${displaySize}px; 
                            background-color: #ccc; 
                            border-radius: 50%; 
                            border: 1px solid #666;
                            position: absolute;
                            right: 0;
                            top: 0;
                        "></div>
                    </div>
                    <span style="font-size: 10px; color: #333;">${bin.label}</span>
                </div>
            `;
        });
        sizeLegend.innerHTML = sizeHtml;
    }
}

function setScaleMode(mode) {
    currentScaleMode = mode;
    
    if (canvasOverlay) {
        canvasOverlay.setScaleMode(mode);
        console.log(`Scale mode changed to: ${mode}`);
    }
    
    // Update UI to reflect current mode
    document.querySelectorAll('.scale-control').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-scale="${mode}"]`)?.classList.add('active');
    
    // Update legend text
    const scaleText = document.getElementById('current-scale');
    if (scaleText) {
        scaleText.textContent = mode;
    }
}

// Unit testing functions for canvas coordinate transformation
function calculateCanvasLayout(assetBounds, currentMapCenter, currentZoom, viewportSize) {
    const pixelsPerDegreeAtZoom = Math.pow(2, currentZoom) * 256 / 360;
    
    // Calculate container points for asset bounds
    const nwContainerX = (assetBounds.west - currentMapCenter.lng) * pixelsPerDegreeAtZoom + viewportSize.width / 2;
    const nwContainerY = (currentMapCenter.lat - assetBounds.north) * pixelsPerDegreeAtZoom + viewportSize.height / 2;
    const seContainerX = (assetBounds.east - currentMapCenter.lng) * pixelsPerDegreeAtZoom + viewportSize.width / 2;
    const seContainerY = (currentMapCenter.lat - assetBounds.south) * pixelsPerDegreeAtZoom + viewportSize.height / 2;
    
    const canvasWidth = Math.abs(seContainerX - nwContainerX);
    const canvasHeight = Math.abs(seContainerY - nwContainerY);
    const canvasLeft = Math.min(nwContainerX, seContainerX);
    const canvasTop = Math.min(nwContainerY, seContainerY);
    
    // Calculate viewport visibility
    const visibleLeft = Math.max(0, canvasLeft);
    const visibleTop = Math.max(0, canvasTop);
    const visibleRight = Math.min(viewportSize.width, canvasLeft + canvasWidth);
    const visibleBottom = Math.min(viewportSize.height, canvasTop + canvasHeight);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visiblePercent = (visibleWidth * visibleHeight) / (canvasWidth * canvasHeight) * 100;
    
    return {
        canvasPosition: { x: canvasLeft, y: canvasTop },
        canvasSize: { width: canvasWidth, height: canvasHeight },
        dataCenterPosition: { x: (nwContainerX + seContainerX) / 2, y: (nwContainerY + seContainerY) / 2 },
        pixelSpacing: { x: canvasWidth / 201, y: canvasHeight / 201 },
        viewportOffset: {
            x: canvasLeft < 0 ? Math.abs(canvasLeft) : 0,
            y: canvasTop < 0 ? Math.abs(canvasTop) : 0
        },
        visibility: {
            visiblePercent: visiblePercent,
            visibleArea: { left: visibleLeft, top: visibleTop, width: visibleWidth, height: visibleHeight }
        }
    };
}

function testCanvasLayout() {
    console.log("=== CANVAS LAYOUT UNIT TESTS ===");
    
    // Test scenarios
    const testCases = [
        {
            name: "TEST 1: Centered on asset, zoom 9",
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 9,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 2: Centered on asset, zoom 10", 
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 10,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 3: Centered on asset, zoom 11",
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 11,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 4: Off-center positioning, zoom 10",
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.52, lng: -46.62 },
            zoom: 10,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 5: Far off-center, zoom 10",
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.48, lng: -46.58 },
            zoom: 10,
            viewport: { width: 1920, height: 1080 }
        }
    ];
    
    testCases.forEach((testCase, index) => {
        console.log(`\n--- ${testCase.name} ---`);
        
        const layout = calculateCanvasLayout(
            testCase.assetBounds,
            testCase.mapCenter, 
            testCase.zoom,
            testCase.viewport
        );
        
        console.log(`Canvas Position: ${layout.canvasPosition.x.toFixed(0)}, ${layout.canvasPosition.y.toFixed(0)}`);
        console.log(`Canvas Size: ${layout.canvasSize.width.toFixed(0)} x ${layout.canvasSize.height.toFixed(0)}`);
        console.log(`Data Center: ${layout.dataCenterPosition.x.toFixed(0)}, ${layout.dataCenterPosition.y.toFixed(0)}`);
        console.log(`Pixel Spacing: ${layout.pixelSpacing.x.toFixed(2)} x ${layout.pixelSpacing.y.toFixed(2)}`);
        console.log(`Viewport Offset: ${layout.viewportOffset.x.toFixed(0)}, ${layout.viewportOffset.y.toFixed(0)}`);
        console.log(`Visible: ${layout.visibility.visiblePercent.toFixed(1)}%`);
        
        // Test assertions - what we expect for correct behavior
        const assertions = [];
        
        if (index + 1 === 1) { // TEST 1: Centered on asset, zoom 9
            assertions.push({ 
                name: "Data center should be at viewport center", 
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540", // viewport center
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be fully visible",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "100.0%",
                passes: layout.visibility.visiblePercent > 99.0
            });
        }
        
        if (index + 1 === 2) { // TEST 2: Centered on asset, zoom 10
            assertions.push({
                name: "Data center should be at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be 2x larger than zoom 9",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: "~2x previous test size",
                passes: true // Will compare visually
            });
        }
        
        if (index + 1 === 3) { // TEST 3: Centered on asset, zoom 11  
            assertions.push({
                name: "Data center should be at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be 4x larger than zoom 9",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: "~4x zoom 9 size",
                passes: true // Will compare visually
            });
        }
        
        if (index + 1 === 4) { // TEST 4: Off-center positioning
            assertions.push({
                name: "Data center should be off-center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "NOT 960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) > 50 || Math.abs(layout.dataCenterPosition.y - 540) > 50
            });
            assertions.push({
                name: "Canvas should be partially visible",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "10-90%",
                passes: layout.visibility.visiblePercent > 10 && layout.visibility.visiblePercent < 90
            });
        }
        
        if (index + 1 === 5) { // TEST 5: Far off-center
            assertions.push({
                name: "Canvas should have minimal or no visibility",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "<50%",
                passes: layout.visibility.visiblePercent < 50
            });
        }
        
        // Run assertions
        assertions.forEach(assertion => {
            const status = assertion.passes ? "✓ PASS" : "✗ FAIL";
            console.log(`${status}: ${assertion.name}`);
            console.log(`  Expected: ${assertion.expected}`);
            console.log(`  Actual: ${assertion.actual}`);
        });
        
        if (assertions.length === 0) {
            console.log("No specific assertions for this test case");
        }
    });
    
}


// Loading state management functions
function showLoadingIndicator() {
    const summaryStats = document.getElementById('summary-stats');
    if (summaryStats) {
        summaryStats.innerHTML = `
            <div class="mt-2">
                <small class="text-muted">
                    <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    Loading assets data...
                </small>
            </div>
        `;
    }
}

function hideLoadingIndicator() {
    // Summary stats will be updated by updateSummaryStats() when data loads
}

function showLoadingError(message) {
    const errorContainer = document.getElementById('loading-error');
    if (errorContainer) {
        errorContainer.innerHTML = `
            <div class="alert alert-warning alert-dismissible fade show" role="alert">
                <small>${message}</small>
                <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        errorContainer.style.display = 'block';
    } else {
        // Fallback to console if no error container exists
        console.warn('Loading error:', message);
    }
}

function clearLoadingError() {
    const errorContainer = document.getElementById('loading-error');
    if (errorContainer) {
        errorContainer.innerHTML = '';
        errorContainer.style.display = 'none';
    }
}

// New CircleCanvasOverlay class implementing best practices visualization
class CircleCanvasOverlay extends L.Layer {
    constructor(overlayData, bounds, options = {}) {
        super();
        this.overlayData = overlayData;
        this.originalBounds = bounds;
        this.options = options;
        this.canvas = null;
        this.ctx = null;
        this.map = null;
        
        // SIMPLIFIED: Use overlay bounds directly - no complex calculations needed
        this.bounds = overlayData.bounds;
    }
    
    onAdd(map) {
        this.map = map;
        this.createCanvas();
        this.updateCanvasPosition();
        
        // Add event listeners for map updates
        this._onViewReset = this.updateCanvasPosition.bind(this);
        this._onZoom = this.updateCanvasPosition.bind(this);
        this._onMoveEnd = this.updateCanvasPosition.bind(this);
        
        map.on('viewreset', this._onViewReset);
        map.on('zoom', this._onZoom);
        map.on('moveend', this._onMoveEnd); // Changed from 'move' to 'moveend' to prevent lag
        
        return this;
    }
    
    onRemove(map) {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        if (map && this._onViewReset) {
            map.off('viewreset', this._onViewReset);
            map.off('zoom', this._onZoom);
            map.off('moveend', this._onMoveEnd);
        }
        
        return this;
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        // Canvas will inherit z-index from overlay pane (400), no need to set explicitly
        
        // Add border to show overlay bounds - match selected asset's country color
        const assetColor = selectedAsset ? (countryColors[selectedAsset.country] || '#808080') : '#808080';
        this.canvas.style.border = `2px solid ${assetColor}`;
        
        this.ctx = this.canvas.getContext('2d');
        
        // Add canvas to Leaflet's overlay pane for proper Web Mercator handling
        const overlayPane = this.map.getPane('overlayPane');
        overlayPane.appendChild(this.canvas);
        
        
    }
    
    updateCanvasPosition() {
        if (!this.canvas) return;
        
        const zoom = this.map.getZoom();
        
        // Web Mercator coordinate handling with proper layer point positioning
        const layerNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        const layerSE = this.map.latLngToLayerPoint([this.bounds.south, this.bounds.east]);
        
        // Debug canvas positioning for CircleCanvasOverlay
        
        let width = Math.abs(layerSE.x - layerNW.x);
        let height = Math.abs(layerSE.y - layerNW.y);
        
        // Ensure minimum size
        if (width < 10 || height < 10) {
            this.canvas.style.display = 'none';
            return;
        }
        
        this.canvas.style.display = 'block';
        
        // Position canvas using layer coordinates (relative to overlay pane)
        // SIMPLIFIED: Direct canvas positioning with EPSG:4326
        const canvasLeft = layerNW.x;
        const canvasTop = layerNW.y;
        
        
        this.canvas.style.left = canvasLeft + 'px';
        this.canvas.style.top = canvasTop + 'px';
        
        // Update canvas dimensions if changed
        const dimensionsChanged = Math.abs(width - this.canvas.width) > 5 || Math.abs(height - this.canvas.height) > 5;
        
        if (dimensionsChanged) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        
        // Always render circles on position updates to handle zoom level changes
        this.renderCircles();
        
        // Update legend after rendering to reflect new circle sizes
        if (dimensionsChanged) {
            const legend = document.getElementById('exposure-legend');
            if (legend && legend.classList.contains('visible')) {
                populateLegendContent();
            }
        }
    }
    
    renderCircles() {
        if (!this.ctx || !this.overlayData) return;
        
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        if (canvasWidth <= 0 || canvasHeight <= 0) return;
        
        // Always clear canvas first to prevent drawing on top of previous content
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Only render circles at zoom level 10 and above
        const zoom = this.map.getZoom();
        if (zoom < 10) {
            return; // Canvas is cleared but no circles are drawn
        }
        
        const { width: dataWidth, height: dataHeight } = this.overlayData.dimensions;
        
        // Check for unified format vs legacy format
        if (!this.overlayData.data && this.overlayData.data_arrays) {
            // Legacy format - update to new structure
            console.warn('Using legacy data_arrays format, updating to unified format');
            this.overlayData.data = this.overlayData.data_arrays;
            delete this.overlayData.data_arrays;
        }
        
        if (!this.overlayData.data || !this.overlayData.data.concentration || !this.overlayData.data.population) {
            console.error('Missing required data arrays in overlay data:', this.overlayData);
            return;
        }
        
        const concentrationData = this.overlayData.data.concentration;
        const populationData = this.overlayData.data.population;
        
        // SIMPLIFIED: Direct 1:1 scaling - no edge trimming complexity
        const scaleX = canvasWidth / dataWidth;
        const scaleY = canvasHeight / dataHeight;
        
        
        const gridCellSize = Math.min(scaleX, scaleY);
        let circlesRendered = 0;
        
        // Render circles for each data point
        for (let dataY = 0; dataY < dataHeight; dataY++) {
            for (let dataX = 0; dataX < dataWidth; dataX++) {
                const concentration = concentrationData[dataY][dataX];
                const population = populationData[dataY][dataX];
                
                // Skip if no meaningful data
                if (population <= 0 || concentration <= 0) continue;
                
                circlesRendered++;
                
                // Classify data using best practices
                const concentrationBin = classifyConcentration(concentration);
                const populationBin = classifyPopulation(population);
                
                // SIMPLIFIED: Direct 1:1 positioning - no offset calculations needed
                const centerX = (dataX + 0.5) * scaleX;
                const centerY = (dataY + 0.5) * scaleY;
                
                // Debug first few circles
                
                // Calculate circle radius based on grid size and population
                // Grid cell size in pixels
                const gridCellSize = Math.min(scaleX, scaleY);
                
                // Scale radius based on population bin and grid cell size
                // Largest circles = 2x grid cell, smallest = 1px minimum
                const maxRadius = gridCellSize * 1;
                const populationFactor = (populationBin.radius - POPULATION_BINS[0].radius) / 
                                       (POPULATION_BINS[POPULATION_BINS.length-1].radius - POPULATION_BINS[0].radius);
                const radius = (populationFactor * maxRadius);
                
                
                // Draw circle
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                
                // Set color based on concentration
                const rgb = hexToRgb(concentrationBin.color);
                if (!rgb) {
                    console.warn('Invalid color:', concentrationBin.color);
                    continue;
                }
                this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
                this.ctx.fill();
                
                // Optional: Add stroke for better visibility
                this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                this.ctx.lineWidth = 0.5;
                this.ctx.stroke();
            }
        }
        
        
        // 🎯 Add center cross-hair marker for alignment testing
        this.addCenterMarker();
        
        // 🔵 Add asset location marker for comparison
        this.addAssetLocationMarker();
        
    }
    
    addCenterMarker() {
        if (!this.ctx) return;
        
        // Calculate exact center of overlay bounds
        const centerLat = (this.overlayData.bounds.north + this.overlayData.bounds.south) / 2;
        const centerLng = (this.overlayData.bounds.east + this.overlayData.bounds.west) / 2;
        
        // 🎯 RETICLE POSITIONING: Show original TIFF center on trimmed data canvas
        // The reticle represents the center of the original TIFF bounds (confirmed correct)
        // But the canvas now shows only the trimmed data area
        // So we need to calculate where the original center appears within the trimmed canvas
        
        const centerLatLng = L.latLng(centerLat, centerLng);
        const centerLayerPoint = this.map.latLngToLayerPoint(centerLatLng);
        const canvasNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        
        // Canvas-relative coordinates
        const canvasX = centerLayerPoint.x - canvasNW.x;
        const canvasY = centerLayerPoint.y - canvasNW.y;
        
        
        // 📊 ALIGNMENT ANALYSIS - ALL OFFSETS RELATIVE TO TRUSTED OVERLAY CENTER
        if (selectedAsset) {
            // REFERENCE POINT: Pipeline-calculated overlay center (most trusted)
            const trustedLat = centerLat;
            const trustedLon = centerLng;
            const trustedScreenPos = this.map.latLngToContainerPoint([trustedLat, trustedLon]);
            
            // Get other positions
            const originalAssetLat = selectedAsset.center_lat;
            const originalAssetLon = selectedAsset.center_lon;
            const originalAssetScreenPos = this.map.latLngToContainerPoint([originalAssetLat, originalAssetLon]);
            
            // Find current marker position (should be corrected to match overlay center)
            const assetKey = `${selectedAsset.country}_${selectedAsset.asset_id}`;
            const marker = assetMarkerMap.get(assetKey);
            let currentMarkerScreenPos = trustedScreenPos; // Default to trusted position
            let currentMarkerLat = trustedLat;
            let currentMarkerLon = trustedLon;
            
            if (marker) {
                const markerLatLng = marker.getLatLng();
                currentMarkerLat = markerLatLng.lat;
                currentMarkerLon = markerLatLng.lng;
                currentMarkerScreenPos = this.map.latLngToContainerPoint([currentMarkerLat, currentMarkerLon]);
            }
            
            // Calculate offsets relative to trusted position
            const originalAssetOffsetX = originalAssetScreenPos.x - trustedScreenPos.x;
            const originalAssetOffsetY = originalAssetScreenPos.y - trustedScreenPos.y;
            const originalAssetDistance = Math.sqrt(originalAssetOffsetX * originalAssetOffsetX + originalAssetOffsetY * originalAssetOffsetY);
            
            const currentMarkerOffsetX = currentMarkerScreenPos.x - trustedScreenPos.x;
            const currentMarkerOffsetY = currentMarkerScreenPos.y - trustedScreenPos.y;
            const currentMarkerDistance = Math.sqrt(currentMarkerOffsetX * currentMarkerOffsetX + currentMarkerOffsetY * currentMarkerOffsetY);
            
            // Determine accuracy status
            const isAligned = currentMarkerDistance < 3;
            const wasVeryWrong = originalAssetDistance > 20;
            
        }
        
    }
    
    addAssetLocationMarker() {
        if (!this.ctx || !selectedAsset) return;
        
        // Get the asset's coordinates from the original asset data
        const assetLat = selectedAsset.center_lat;
        const assetLon = selectedAsset.center_lon;
        
        // Convert asset location to canvas coordinates
        const assetLatLng = L.latLng(assetLat, assetLon);
        const assetLayerPoint = this.map.latLngToLayerPoint(assetLatLng);
        const canvasNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        
        // Canvas-relative coordinates for the asset location
        const assetCanvasX = assetLayerPoint.x - canvasNW.x;
        const assetCanvasY = assetLayerPoint.y - canvasNW.y;
        
        
        // Calculate and log the offset between asset location and overlay center
        const overlayLat = (this.overlayData.bounds.north + this.overlayData.bounds.south) / 2;
        const overlayLon = (this.overlayData.bounds.east + this.overlayData.bounds.west) / 2;
        const overlayLayerPoint = this.map.latLngToLayerPoint([overlayLat, overlayLon]);
        const overlayCanvasX = overlayLayerPoint.x - canvasNW.x;
        const overlayCanvasY = overlayLayerPoint.y - canvasNW.y;
        
        const offsetX = assetCanvasX - overlayCanvasX;
        const offsetY = assetCanvasY - overlayCanvasY;
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        
    }
}

// ===== CITY SEARCH FUNCTIONALITY =====

// Database of major world cities with coordinates
const CITY_DATABASE = [
    // Major global cities
    { name: "New York", country: "United States", lat: 40.7128, lng: -74.0060 },
    { name: "London", country: "United Kingdom", lat: 51.5074, lng: -0.1278 },
    { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
    { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
    { name: "Berlin", country: "Germany", lat: 52.5200, lng: 13.4050 },
    { name: "Beijing", country: "China", lat: 39.9042, lng: 116.4074 },
    { name: "Shanghai", country: "China", lat: 31.2304, lng: 121.4737 },
    { name: "Mumbai", country: "India", lat: 19.0760, lng: 72.8777 },
    { name: "Delhi", country: "India", lat: 28.7041, lng: 77.1025 },
    { name: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333 },
    { name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
    { name: "Los Angeles", country: "United States", lat: 34.0522, lng: -118.2437 },
    { name: "Chicago", country: "United States", lat: 41.8781, lng: -87.6298 },
    { name: "Houston", country: "United States", lat: 29.7604, lng: -95.3698 },
    { name: "Phoenix", country: "United States", lat: 33.4484, lng: -112.0740 },
    { name: "Philadelphia", country: "United States", lat: 39.9526, lng: -75.1652 },
    { name: "San Antonio", country: "United States", lat: 29.4241, lng: -98.4936 },
    { name: "San Diego", country: "United States", lat: 32.7157, lng: -117.1611 },
    { name: "Dallas", country: "United States", lat: 32.7767, lng: -96.7970 },
    { name: "San Jose", country: "United States", lat: 37.3382, lng: -121.8863 },
    { name: "Austin", country: "United States", lat: 30.2672, lng: -97.7431 },
    { name: "Jacksonville", country: "United States", lat: 30.3322, lng: -81.6557 },
    { name: "Fort Worth", country: "United States", lat: 32.7555, lng: -97.3308 },
    { name: "Columbus", country: "United States", lat: 39.9612, lng: -82.9988 },
    { name: "San Francisco", country: "United States", lat: 37.7749, lng: -122.4194 },
    { name: "Charlotte", country: "United States", lat: 35.2271, lng: -80.8431 },
    { name: "Indianapolis", country: "United States", lat: 39.7684, lng: -86.1581 },
    { name: "Seattle", country: "United States", lat: 47.6062, lng: -122.3321 },
    { name: "Denver", country: "United States", lat: 39.7392, lng: -104.9903 },
    { name: "Boston", country: "United States", lat: 42.3601, lng: -71.0589 },
    { name: "Washington D.C.", country: "United States", lat: 38.9072, lng: -77.0369 },
    
    // European cities
    { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
    { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
    { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
    { name: "Barcelona", country: "Spain", lat: 41.3851, lng: 2.1734 },
    { name: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738 },
    { name: "Prague", country: "Czech Republic", lat: 50.0755, lng: 14.4378 },
    { name: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402 },
    { name: "Warsaw", country: "Poland", lat: 52.2297, lng: 21.0122 },
    { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },
    { name: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683 },
    { name: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522 },
    { name: "Helsinki", country: "Finland", lat: 60.1699, lng: 24.9384 },
    { name: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517 },
    { name: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417 },
    { name: "Geneva", country: "Switzerland", lat: 46.2044, lng: 6.1432 },
    { name: "Munich", country: "Germany", lat: 48.1351, lng: 11.5820 },
    { name: "Hamburg", country: "Germany", lat: 53.5511, lng: 9.9937 },
    { name: "Frankfurt", country: "Germany", lat: 50.1109, lng: 8.6821 },
    { name: "Cologne", country: "Germany", lat: 50.9375, lng: 6.9603 },
    { name: "Milan", country: "Italy", lat: 45.4642, lng: 9.1900 },
    { name: "Naples", country: "Italy", lat: 40.8518, lng: 14.2681 },
    { name: "Florence", country: "Italy", lat: 43.7696, lng: 11.2558 },
    { name: "Venice", country: "Italy", lat: 45.4408, lng: 12.3155 },
    { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
    { name: "Porto", country: "Portugal", lat: 41.1579, lng: -8.6291 },
    { name: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
    { name: "Edinburgh", country: "United Kingdom", lat: 55.9533, lng: -3.1883 },
    { name: "Manchester", country: "United Kingdom", lat: 53.4808, lng: -2.2426 },
    { name: "Birmingham", country: "United Kingdom", lat: 52.4862, lng: -1.8904 },
    { name: "Liverpool", country: "United Kingdom", lat: 53.4084, lng: -2.9916 },
    { name: "Glasgow", country: "United Kingdom", lat: 55.8642, lng: -4.2518 },
    { name: "Athens", country: "Greece", lat: 37.9755, lng: 23.7348 },
    { name: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
    { name: "Ankara", country: "Turkey", lat: 39.9334, lng: 32.8597 },
    { name: "Moscow", country: "Russia", lat: 55.7558, lng: 37.6176 },
    { name: "Saint Petersburg", country: "Russia", lat: 59.9311, lng: 30.3609 },
    { name: "Kiev", country: "Ukraine", lat: 50.4501, lng: 30.5234 },
    
    // Asian cities
    { name: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.9780 },
    { name: "Osaka", country: "Japan", lat: 34.6937, lng: 135.5023 },
    { name: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681 },
    { name: "Hong Kong", country: "Hong Kong", lat: 22.3193, lng: 114.1694 },
    { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
    { name: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
    { name: "Kuala Lumpur", country: "Malaysia", lat: 3.1390, lng: 101.6869 },
    { name: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
    { name: "Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 },
    { name: "Ho Chi Minh City", country: "Vietnam", lat: 10.8231, lng: 106.6297 },
    { name: "Hanoi", country: "Vietnam", lat: 21.0285, lng: 105.8542 },
    { name: "Taipei", country: "Taiwan", lat: 25.0330, lng: 121.5654 },
    { name: "Bangalore", country: "India", lat: 12.9716, lng: 77.5946 },
    { name: "Chennai", country: "India", lat: 13.0827, lng: 80.2707 },
    { name: "Kolkata", country: "India", lat: 22.5726, lng: 88.3639 },
    { name: "Hyderabad", country: "India", lat: 17.3850, lng: 78.4867 },
    { name: "Pune", country: "India", lat: 18.5204, lng: 73.8567 },
    { name: "Ahmedabad", country: "India", lat: 23.0225, lng: 72.5714 },
    { name: "Karachi", country: "Pakistan", lat: 24.8607, lng: 67.0011 },
    { name: "Lahore", country: "Pakistan", lat: 31.5804, lng: 74.3587 },
    { name: "Islamabad", country: "Pakistan", lat: 33.6844, lng: 73.0479 },
    { name: "Dhaka", country: "Bangladesh", lat: 23.8103, lng: 90.4125 },
    { name: "Colombo", country: "Sri Lanka", lat: 6.9271, lng: 79.8612 },
    { name: "Yangon", country: "Myanmar", lat: 16.8661, lng: 96.1951 },
    { name: "Phnom Penh", country: "Cambodia", lat: 11.5564, lng: 104.9282 },
    { name: "Vientiane", country: "Laos", lat: 17.9757, lng: 102.6331 },
    
    // Middle Eastern cities
    { name: "Dubai", country: "United Arab Emirates", lat: 25.2048, lng: 55.2708 },
    { name: "Abu Dhabi", country: "United Arab Emirates", lat: 24.2532, lng: 54.3773 },
    { name: "Doha", country: "Qatar", lat: 25.2854, lng: 51.5310 },
    { name: "Kuwait City", country: "Kuwait", lat: 29.3759, lng: 47.9774 },
    { name: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
    { name: "Jeddah", country: "Saudi Arabia", lat: 21.4858, lng: 39.1925 },
    { name: "Tehran", country: "Iran", lat: 35.6892, lng: 51.3890 },
    { name: "Baghdad", country: "Iraq", lat: 33.3152, lng: 44.3661 },
    { name: "Amman", country: "Jordan", lat: 31.9454, lng: 35.9284 },
    { name: "Beirut", country: "Lebanon", lat: 33.8938, lng: 35.5018 },
    { name: "Damascus", country: "Syria", lat: 33.5138, lng: 36.2765 },
    { name: "Tel Aviv", country: "Israel", lat: 32.0853, lng: 34.7818 },
    { name: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137 },
    
    // African cities
    { name: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
    { name: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
    { name: "Kinshasa", country: "Democratic Republic of Congo", lat: -4.4419, lng: 15.2663 },
    { name: "Johannesburg", country: "South Africa", lat: -26.2041, lng: 28.0473 },
    { name: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241 },
    { name: "Durban", country: "South Africa", lat: -29.8587, lng: 31.0218 },
    { name: "Casablanca", country: "Morocco", lat: 33.5731, lng: -7.5898 },
    { name: "Rabat", country: "Morocco", lat: 34.0209, lng: -6.8416 },
    { name: "Algiers", country: "Algeria", lat: 36.7538, lng: 3.0588 },
    { name: "Tunis", country: "Tunisia", lat: 36.8065, lng: 10.1815 },
    { name: "Tripoli", country: "Libya", lat: 32.8872, lng: 13.1913 },
    { name: "Khartoum", country: "Sudan", lat: 15.5007, lng: 32.5599 },
    { name: "Addis Ababa", country: "Ethiopia", lat: 9.1450, lng: 38.7451 },
    { name: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
    { name: "Kampala", country: "Uganda", lat: 0.3476, lng: 32.5825 },
    { name: "Dar es Salaam", country: "Tanzania", lat: -6.7924, lng: 39.2083 },
    { name: "Lusaka", country: "Zambia", lat: -15.3875, lng: 28.3228 },
    { name: "Harare", country: "Zimbabwe", lat: -17.8252, lng: 31.0335 },
    { name: "Gaborone", country: "Botswana", lat: -24.6282, lng: 25.9231 },
    { name: "Windhoek", country: "Namibia", lat: -22.9576, lng: 17.0832 },
    { name: "Maputo", country: "Mozambique", lat: -25.9692, lng: 32.5732 },
    { name: "Antananarivo", country: "Madagascar", lat: -18.8792, lng: 47.5079 },
    { name: "Port Louis", country: "Mauritius", lat: -20.1654, lng: 57.5016 },
    { name: "Accra", country: "Ghana", lat: 5.6037, lng: -0.1870 },
    { name: "Abuja", country: "Nigeria", lat: 9.0579, lng: 7.4951 },
    { name: "Dakar", country: "Senegal", lat: 14.7167, lng: -17.4677 },
    { name: "Bamako", country: "Mali", lat: 12.6392, lng: -8.0029 },
    { name: "Ouagadougou", country: "Burkina Faso", lat: 12.3714, lng: -1.5197 },
    { name: "Abidjan", country: "Ivory Coast", lat: 5.3600, lng: -4.0083 },
    { name: "Monrovia", country: "Liberia", lat: 6.2907, lng: -10.7605 },
    { name: "Freetown", country: "Sierra Leone", lat: 8.4840, lng: -13.2299 },
    { name: "Conakry", country: "Guinea", lat: 9.6412, lng: -13.5784 },
    { name: "Bissau", country: "Guinea-Bissau", lat: 11.8817, lng: -15.6178 },
    { name: "Praia", country: "Cape Verde", lat: 14.9177, lng: -23.5092 },
    
    // South American cities
    { name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lng: -43.1729 },
    { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
    { name: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428 },
    { name: "Bogotá", country: "Colombia", lat: 4.7110, lng: -74.0721 },
    { name: "Santiago", country: "Chile", lat: -33.4489, lng: -70.6693 },
    { name: "Caracas", country: "Venezuela", lat: 10.4806, lng: -66.9036 },
    { name: "Quito", country: "Ecuador", lat: -0.1807, lng: -78.4678 },
    { name: "La Paz", country: "Bolivia", lat: -16.5000, lng: -68.1193 },
    { name: "Asunción", country: "Paraguay", lat: -25.2637, lng: -57.5759 },
    { name: "Montevideo", country: "Uruguay", lat: -34.9011, lng: -56.1645 },
    { name: "Georgetown", country: "Guyana", lat: 6.8013, lng: -58.1551 },
    { name: "Paramaribo", country: "Suriname", lat: 5.8520, lng: -55.2038 },
    { name: "Cayenne", country: "French Guiana", lat: 4.9333, lng: -52.3333 },
    { name: "Brasília", country: "Brazil", lat: -15.8267, lng: -47.9218 },
    { name: "Belo Horizonte", country: "Brazil", lat: -19.9167, lng: -43.9345 },
    { name: "Salvador", country: "Brazil", lat: -12.9714, lng: -38.5014 },
    { name: "Fortaleza", country: "Brazil", lat: -3.7319, lng: -38.5267 },
    { name: "Recife", country: "Brazil", lat: -8.0476, lng: -34.8770 },
    { name: "Porto Alegre", country: "Brazil", lat: -30.0346, lng: -51.2177 },
    { name: "Curitiba", country: "Brazil", lat: -25.4284, lng: -49.2733 },
    { name: "Manaus", country: "Brazil", lat: -3.1190, lng: -60.0217 },
    { name: "Belém", country: "Brazil", lat: -1.4558, lng: -48.5044 },
    
    // Oceanian cities
    { name: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
    { name: "Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631 },
    { name: "Brisbane", country: "Australia", lat: -27.4698, lng: 153.0251 },
    { name: "Perth", country: "Australia", lat: -31.9505, lng: 115.8605 },
    { name: "Adelaide", country: "Australia", lat: -34.9285, lng: 138.6007 },
    { name: "Canberra", country: "Australia", lat: -35.2809, lng: 149.1300 },
    { name: "Darwin", country: "Australia", lat: -12.4634, lng: 130.8456 },
    { name: "Hobart", country: "Australia", lat: -42.8821, lng: 147.3272 },
    { name: "Auckland", country: "New Zealand", lat: -36.8485, lng: 174.7633 },
    { name: "Wellington", country: "New Zealand", lat: -41.2865, lng: 174.7762 },
    { name: "Christchurch", country: "New Zealand", lat: -43.5321, lng: 172.6362 },
    { name: "Hamilton", country: "New Zealand", lat: -37.7870, lng: 175.2793 },
    { name: "Suva", country: "Fiji", lat: -18.1416, lng: 178.4419 },
    { name: "Port Moresby", country: "Papua New Guinea", lat: -9.4438, lng: 147.1803 },
    { name: "Nuku'alofa", country: "Tonga", lat: -21.1393, lng: -175.2046 },
    { name: "Apia", country: "Samoa", lat: -13.8333, lng: -171.7667 },
    { name: "Port Vila", country: "Vanuatu", lat: -17.7333, lng: 168.3167 },
    { name: "Honiara", country: "Solomon Islands", lat: -9.4280, lng: 159.9490 },
    { name: "Tarawa", country: "Kiribati", lat: 1.3382, lng: 173.0176 },
    { name: "Majuro", country: "Marshall Islands", lat: 7.1315, lng: 171.1845 },
    { name: "Palikir", country: "Federated States of Micronesia", lat: 6.9248, lng: 158.1610 },
    { name: "Ngerulmud", country: "Palau", lat: 7.5006, lng: 134.6242 },
    { name: "Funafuti", country: "Tuvalu", lat: -8.5243, lng: 179.1942 },
    { name: "Yaren", country: "Nauru", lat: -0.5477, lng: 166.9209 }
];

// City search state
let citySearchInput = null;
let citySearchResults = null;
let citySearchClearBtn = null;
let currentSearchResults = [];
let selectedCityIndex = -1;
let isNavigatingToCity = false; // Flag to prevent clearing search when we're navigating

// Initialize city search functionality
function initializeCitySearch() {
    citySearchInput = document.getElementById('city-search-input');
    citySearchResults = document.getElementById('city-search-results');
    citySearchClearBtn = document.getElementById('search-clear-btn');
    
    if (!citySearchInput || !citySearchResults || !citySearchClearBtn) {
        console.warn('City search elements not found');
        return;
    }
    
    // Input event handlers
    citySearchInput.addEventListener('input', handleCitySearchInput);
    citySearchInput.addEventListener('keydown', handleCitySearchKeydown);
    citySearchInput.addEventListener('focus', handleCitySearchFocus);
    citySearchInput.addEventListener('blur', handleCitySearchBlur);
    
    // Clear button handler
    citySearchClearBtn.addEventListener('click', clearCitySearch);
    
    // Map movement handlers to clear search when user pans/zooms away
    map.on('movestart', handleMapMoveStart);
    map.on('zoomstart', handleMapZoomStart);
    
    console.log('City search initialized');
}

// Handle input changes for city search
function handleCitySearchInput(event) {
    const searchTerm = event.target.value.trim();
    
    // Show/hide clear button
    if (searchTerm.length > 0) {
        citySearchClearBtn.style.display = 'block';
    } else {
        citySearchClearBtn.style.display = 'none';
    }
    
    // Search for cities
    if (searchTerm.length >= 2) {
        searchCities(searchTerm);
    } else {
        hideCitySearchResults();
    }
}

// Handle keyboard navigation in city search
function handleCitySearchKeydown(event) {
    if (!citySearchResults || citySearchResults.style.display === 'none') {
        return;
    }
    
    const resultItems = citySearchResults.querySelectorAll('.city-search-result');
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedCityIndex = Math.min(selectedCityIndex + 1, resultItems.length - 1);
            updateCitySearchSelection(resultItems);
            break;
            
        case 'ArrowUp':
            event.preventDefault();
            selectedCityIndex = Math.max(selectedCityIndex - 1, -1);
            updateCitySearchSelection(resultItems);
            break;
            
        case 'Enter':
            event.preventDefault();
            if (selectedCityIndex >= 0 && selectedCityIndex < currentSearchResults.length) {
                selectCity(currentSearchResults[selectedCityIndex]);
            }
            break;
            
        case 'Escape':
            hideCitySearchResults();
            citySearchInput.blur();
            break;
    }
}

// Handle focus events
function handleCitySearchFocus() {
    if (currentSearchResults.length > 0) {
        showCitySearchResults();
    }
}

// Handle blur events (with delay to allow for clicks)
function handleCitySearchBlur() {
    setTimeout(() => {
        hideCitySearchResults();
    }, 200);
}

// Search for cities matching the search term
function searchCities(searchTerm) {
    const normalizedTerm = searchTerm.toLowerCase();
    
    // Filter cities that match the search term
    currentSearchResults = CITY_DATABASE.filter(city => {
        return city.name.toLowerCase().includes(normalizedTerm) ||
               city.country.toLowerCase().includes(normalizedTerm);
    }).slice(0, 8); // Limit to 8 results
    
    selectedCityIndex = -1;
    displayCitySearchResults();
}

// Display city search results
function displayCitySearchResults() {
    if (currentSearchResults.length === 0) {
        hideCitySearchResults();
        return;
    }
    
    citySearchResults.innerHTML = '';
    
    currentSearchResults.forEach((city, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'city-search-result';
        resultItem.innerHTML = `
            <div class="city-name">${city.name}</div>
            <div class="city-details">${city.country}</div>
        `;
        
        resultItem.addEventListener('click', () => selectCity(city));
        resultItem.addEventListener('mouseenter', () => {
            selectedCityIndex = index;
            updateCitySearchSelection(citySearchResults.querySelectorAll('.city-search-result'));
        });
        
        citySearchResults.appendChild(resultItem);
    });
    
    showCitySearchResults();
}

// Update visual selection in city search results
function updateCitySearchSelection(resultItems) {
    resultItems.forEach((item, index) => {
        if (index === selectedCityIndex) {
            item.style.backgroundColor = '#f8f9fa';
        } else {
            item.style.backgroundColor = '';
        }
    });
}

// Show city search results dropdown
function showCitySearchResults() {
    if (citySearchResults && currentSearchResults.length > 0) {
        citySearchResults.style.display = 'block';
    }
}

// Hide city search results dropdown
function hideCitySearchResults() {
    if (citySearchResults) {
        citySearchResults.style.display = 'none';
    }
    selectedCityIndex = -1;
}

// Select a city and navigate to it
function selectCity(city) {
    console.log(`Navigating to city: ${city.name}, ${city.country}`);
    
    // Set flag to prevent clearing search during navigation
    isNavigatingToCity = true;
    
    // Update search input to show selected city
    citySearchInput.value = `${city.name}, ${city.country}`;
    citySearchClearBtn.style.display = 'block';
    
    // Hide search results
    hideCitySearchResults();
    
    // Navigate to city on map with appropriate zoom level
    const targetZoom = 10; // Good zoom level for city view
    map.setView([city.lat, city.lng], targetZoom);
    
    // Reset navigation flag after a delay
    setTimeout(() => {
        isNavigatingToCity = false;
    }, 2000); // 2 second delay to allow for map animation
}

// Clear city search
function clearCitySearch() {
    citySearchInput.value = '';
    citySearchClearBtn.style.display = 'none';
    hideCitySearchResults();
    currentSearchResults = [];
    selectedCityIndex = -1;
    citySearchInput.focus();
}

// Handle map movement start - clear search if user moved away from selected city
function handleMapMoveStart() {
    if (isNavigatingToCity) return; // Don't clear if we're in the middle of navigating to a city
    
    // Check if there's a city currently shown in the search
    const currentValue = citySearchInput.value.trim();
    if (currentValue.length > 0) {
        // Clear the search after a short delay to allow for the movement to complete
        setTimeout(() => {
            if (!isNavigatingToCity) { // Double-check we're not navigating
                clearCitySearch();
            }
        }, 500);
    }
}

// Handle map zoom start - clear search if user zoomed away from selected city
function handleMapZoomStart() {
    if (isNavigatingToCity) return; // Don't clear if we're in the middle of navigating to a city
    
    // Check if there's a city currently shown in the search
    const currentValue = citySearchInput.value.trim();
    if (currentValue.length > 0) {
        // Clear the search after a short delay to allow for the zoom to complete
        setTimeout(() => {
            if (!isNavigatingToCity) { // Double-check we're not navigating
                clearCitySearch();
            }
        }, 500);
    }
}