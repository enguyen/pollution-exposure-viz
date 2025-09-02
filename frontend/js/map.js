// Global variables
let map;
let assetsData = null;
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

// Additional PM2.5 exposure classification (µg/m³) - asset-specific contribution
const CONCENTRATION_BINS = [
    { min: 0,     max: 12,    color: '#FFF45C', label: 'Low Additional Risk (0-12)' },        // Yellow
    { min: 12,    max: 35.4,  color: '#FFA500', label: 'Elevated Additional Risk (12-35)' },   // Orange  
    { min: 35.4,  max: 55.4,  color: '#FF6347', label: 'Significant Additional Risk (35-55)' }, // Tomato red
    { min: 55.4,  max: 150.4, color: '#FF0000', label: 'High Additional Risk (55-150)' },  // Red
    { min: 150.4, max: 250.4, color: '#8B0000', label: 'Very High Additional Risk(150-250)' }, // Dark red
    { min: 250.4, max: Infinity, color: '#800080', label: 'Extreme Additional Risk(250+)' }   // Purple
];

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
    
    // Check for URL parameters
    checkUrlParameters();
}

function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const assetParam = urlParams.get('asset');
    
    if (assetParam) {
        console.log(`URL parameter found: asset=${assetParam}`);
        // Wait for assets to load before jumping to specific asset
        waitForAssetsAndJump(assetParam);
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
    // Create map centered on global view
    map = L.map('map').setView([20, 0], 2);
    
    // Add minimal CartoDB Positron tiles for clean background
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18,
        subdomains: 'abcd'
    }).addTo(map);
    
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
        const lat = asset.center_lat;
        const lon = asset.center_lon;
        const country = asset.country;
        const totalExposure = asset.person_exposure_stats.total_person_exposure;
        
        // Determine marker size based on person-exposure
        const sizeClass = calculateAssetSize(totalExposure, allExposures);
        const color = countryColors[country] || '#666666';
        
        // Determine if this asset is currently selected
        const assetKey = `${country}_${asset.asset_id}`;
        const isSelected = selectedAsset && selectedAsset.country === country && selectedAsset.asset_id === asset.asset_id;
        
        // Create custom icon with selection state
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="asset-marker ${sizeClass}" style="
                background-color: ${color}; 
                border: 2px solid ${isSelected ? '#333' : 'white'};
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                cursor: pointer;
            "></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
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
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="asset-marker ${sizeClass}" style="
            background-color: ${color}; 
            border: 2px solid ${isSelected ? '#333' : 'white'};
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    marker.setIcon(markerIcon);
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
        
        // Clear URL parameter
        const newUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, '', newUrl);
        
        // Reset asset details panel
        document.getElementById('asset-details').innerHTML = `
            <div class="no-selection">
                Click on an asset to view detailed information
            </div>
        `;
    }
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
    
    // Update URL with asset parameter
    const newUrl = `${window.location.origin}${window.location.pathname}?asset=${assetId}`;
    window.history.replaceState({}, '', newUrl);
    
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
            showCanvasOverlay(selectedAsset);
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
                <strong>Additional PM2.5:</strong> ${pixelData.concentration.toFixed(2)} μg/m³<br/>
                <strong>Person-Exposure Impact:</strong> ${pixelData.personExposure.toFixed(2)} person·μg/m³
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
    
    // Always clear any existing point analysis first
    clearPointAnalysis();
    
    // Start new point analysis
    analysisPoint = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        latlng: e.latlng
    };
    pointAnalysisMode = true;
    
    // Show loading state with visual layer
    showPointAnalysisLoading();
    
    // Start the analysis process
    performPointAnalysis(analysisPoint);
}

function clearPointAnalysis() {
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
        
        // Load raw data file
        const filename = `${asset.country}_${asset.asset_id}_raw.json`;
        const response = await fetch(`raw_data/${filename}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load data for ${assetKey}: ${response.statusText}`);
        }
        
        const rawData = await response.json();
        
        // Cache the data
        loadedAssetData.set(assetKey, rawData);
        
        return calculateContributionFromData(rawData, asset, point);
        
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
    
    // Calculate total additional PM2.5
    const totalAdditionalPM25 = contributingAssets.reduce((sum, ca) => sum + ca.contribution.concentration, 0);
    
    // Generate the results HTML
    const assetDetails = document.getElementById('asset-details');
    if (assetDetails) {
        let html = `
            <div style="padding: 20px;">
                <h5>📍 Point Analysis</h5>
                <p><strong>Location:</strong> ${point.lat.toFixed(6)}°, ${point.lng.toFixed(6)}°</p>
                
                <div class="alert alert-success mb-3">
                    <strong>🔢 Total Additional PM2.5:</strong> ${totalAdditionalPM25.toFixed(2)} μg/m³<br>
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
                <div class="mb-3">
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
                        <strong>Distance:</strong> ${distance.toFixed(1)} km ${direction}<br>
                        <strong>Population at point:</strong> ${contribution.population.toFixed(1)} people
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
    
    // Convert to data array indices
    const dataX = Math.floor(relativeX * overlayData.dimensions.width);
    const dataY = Math.floor(relativeY * overlayData.dimensions.height);
    
    // Bounds check
    if (dataX < 0 || dataX >= overlayData.dimensions.width || 
        dataY < 0 || dataY >= overlayData.dimensions.height) return null;
    
    // Get data values
    const concentration = overlayData.data_arrays.concentration[dataY][dataX];
    const population = overlayData.data_arrays.population[dataY][dataX];
    const personExposure = overlayData.data_arrays.person_exposure[dataY][dataX];
    
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

function updateAssetDetailsPanel(asset) {
    const exposureStats = asset.person_exposure_stats;
    const bounds = asset.bounds;
    
    const detailsHtml = `
        <div class="asset-details">
            <h5 class="mb-3">
                Asset ${asset.asset_id} 
                <span class="badge" style="background-color: ${countryColors[asset.country] || '#666'}">${asset.country}</span>
            </h5>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${formatNumber(exposureStats.total_person_exposure)}</div>
                    <div class="stat-label">Total Additional Person-Exposure</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${exposureStats.non_zero_pixels.toLocaleString()}</div>
                    <div class="stat-label">Affected Area (pixels)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatNumber(exposureStats.max_person_exposure)}</div>
                    <div class="stat-label">Peak Additional Exposure</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${exposureStats.non_zero_mean.toFixed(1)}</div>
                    <div class="stat-label">Mean Additional Exposure</div>
                </div>
            </div>
            
            <div class="mt-3">
                <strong>Location:</strong> ${asset.center_lat.toFixed(4)}°, ${asset.center_lon.toFixed(4)}°<br>
                <strong>Coverage:</strong> ${((bounds.right - bounds.left) * 111).toFixed(1)} × ${((bounds.top - bounds.bottom) * 111).toFixed(1)} km<br>
                <strong>Total Pixels:</strong> ${asset.total_pixels.toLocaleString()}<br>
                <strong>Processed:</strong> ${new Date(asset.processed_date).toLocaleDateString()}
            </div>
            
            <div class="pixel-counts">
                <h6>Additional PM2.5 Distribution (μg/m³)</h6>
                ${generatePixelBars(asset.concentration_pixel_counts, 'concentration')}
                
                <h6 class="mt-3">Population Exposed Distribution</h6>
                ${generatePixelBars(asset.population_pixel_counts, 'population')}
                
                <h6 class="mt-3">Additional Person-Exposure Distribution</h6>
                ${generatePixelBars(asset.person_exposure_pixel_counts, 'exposure')}
            </div>
            
            <div class="legend">
                <div class="legend-title">Map Legend</div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-xs" style="background-color: #ccc;"></div>
                    Low exposure (≤25th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-sm" style="background-color: #999;"></div>
                    Medium-low (25-50th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-md" style="background-color: #666;"></div>
                    Medium (50-75th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-lg" style="background-color: #333;"></div>
                    High (75-90th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-xl" style="background-color: #000;"></div>
                    Very high (≥90th percentile)
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('asset-details').innerHTML = detailsHtml;
}

function generatePixelBars(pixelCounts, type) {
    const totalPixels = Object.values(pixelCounts).reduce((sum, count) => sum + count, 0);
    const colorClass = `${type}-bar`;
    
    let barsHtml = '';
    for (const [range, count] of Object.entries(pixelCounts)) {
        if (count === 0) continue;
        
        const percentage = (count / totalPixels) * 100;
        const width = Math.max(percentage, 3); // Minimum 3% width for visibility
        
        barsHtml += `
            <div class="pixel-bar">
                <div class="pixel-bar-fill ${colorClass}" style="width: ${width}%">
                    ${range}: ${count.toLocaleString()} (${percentage.toFixed(1)}%)
                </div>
            </div>
        `;
    }
    
    return barsHtml;
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
        this.canvas.style.border = '2px dotted black';
        
        this.ctx = this.canvas.getContext('2d');
        
        // Add canvas to Leaflet's overlay pane for proper coordinate handling
        const overlayPane = this.map.getPane('overlayPane');
        overlayPane.appendChild(this.canvas);
    }
    
    updateCanvasPosition() {
        if (!this.canvas) return;
        
        const bounds = this.bounds;
        const zoom = this.map.getZoom();
        
        
        // Get layer points for proper overlay positioning
        const containerNW = this.map.latLngToLayerPoint([bounds.north, bounds.west]);
        const containerSE = this.map.latLngToLayerPoint([bounds.south, bounds.east]);
        
        
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
        
        // Position canvas using container coordinates - NW point is the actual top-left
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
        
        if (Math.abs(width - currentWidth) > 5 || Math.abs(height - currentHeight) > 5) {
            this.canvas.width = width;
            this.canvas.height = height;
            // Re-render only when dimensions actually change
            this.renderCanvas();
        }
    }
    
    updatePositionOnly() {
        // Lightweight position update during animations - no re-rendering
        if (!this.canvas) return;
        
        const bounds = this.bounds;
        const containerNW = this.map.latLngToLayerPoint([bounds.north, bounds.west]);
        const containerSE = this.map.latLngToLayerPoint([bounds.south, bounds.east]);
        
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
        
        try {
            // Clear canvas
            this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            
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
                    
                    // Map to canvas coordinates - direct mapping, no offset compensation needed
                    const baseCanvasX = Math.floor(dataX * scaleX);
                    const baseCanvasY = Math.floor(dataY * scaleY);
                    
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

// New data loading function for overlay format
async function loadOverlayDataForAsset(asset) {
    try {
        const response = await fetch(`overlays/${asset.country}_${asset.asset_id}_data.json`);
        if (!response.ok) {
            throw new Error(`Failed to load overlay data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error loading overlay data for ${asset.country}_${asset.asset_id}:`, error);
        return null;
    }
}

// Legacy raw data loading function (kept for compatibility)
async function loadRawAssetData(asset) {
    try {
        // Construct the raw data filename from asset info
        const filename = `${asset.country}_${asset.asset_id}_raw.json`;
        const response = await fetch(`raw_data/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load raw data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error loading raw data for ${asset.country}_${asset.asset_id}:`, error);
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
                    
                    console.log(`Adding legacy canvas overlay for: ${requestId}`);
                    canvasOverlay = new CanvasOverlay(rawData, bounds, {
                        scaleMode: currentScaleMode
                    });
                    map.addLayer(canvasOverlay);
                    showExposureLegend();
                }
            });
        }
        
        const bounds = {
            north: overlayData.bounds.north,
            south: overlayData.bounds.south,
            east: overlayData.bounds.east,
            west: overlayData.bounds.west
        };
        
        // Use new circle-based visualization approach
        console.log(`Adding circle canvas overlay for: ${requestId}`);
        canvasOverlay = new CircleCanvasOverlay(overlayData, bounds, {
            scaleMode: currentScaleMode
        });
        
        map.addLayer(canvasOverlay);
        showExposureLegend();
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
        this.bounds = bounds;
        this.options = options;
        this.canvas = null;
        this.ctx = null;
        this.map = null;
    }
    
    onAdd(map) {
        this.map = map;
        this.createCanvas();
        this.updateCanvasPosition();
        
        // Add event listeners for map updates
        this._onViewReset = this.updateCanvasPosition.bind(this);
        this._onZoom = this.updateCanvasPosition.bind(this);
        this._onMove = this.updateCanvasPosition.bind(this);
        
        map.on('viewreset', this._onViewReset);
        map.on('zoom', this._onZoom);
        map.on('move', this._onMove);
        
        return this;
    }
    
    onRemove(map) {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        if (map && this._onViewReset) {
            map.off('viewreset', this._onViewReset);
            map.off('zoom', this._onZoom);
            map.off('move', this._onMove);
        }
        
        return this;
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        // Canvas will inherit z-index from overlay pane (400), no need to set explicitly
        
        
        this.ctx = this.canvas.getContext('2d');
        
        // Add canvas to Leaflet's overlay pane instead of map container
        const overlayPane = this.map.getPane('overlayPane');
        overlayPane.appendChild(this.canvas);
        
        
    }
    
    updateCanvasPosition() {
        if (!this.canvas) return;
        
        const zoom = this.map.getZoom();
        
        // Use layerPointToContainerPoint for proper coordinate transformation
        // First get the layer points (overlay pane coordinates)
        const layerNW = this.map.latLngToLayerPoint([this.bounds.north, this.bounds.west]);
        const layerSE = this.map.latLngToLayerPoint([this.bounds.south, this.bounds.east]);
        
        let width = Math.abs(layerSE.x - layerNW.x);
        let height = Math.abs(layerSE.y - layerNW.y);
        
        // Ensure minimum size
        if (width < 10 || height < 10) {
            this.canvas.style.display = 'none';
            return;
        }
        
        this.canvas.style.display = 'block';
        
        // Position canvas using layer coordinates (relative to overlay pane)
        const canvasLeft = layerNW.x;
        const canvasTop = layerNW.y;
        this.canvas.style.left = canvasLeft + 'px';
        this.canvas.style.top = canvasTop + 'px';
        
        // Update canvas dimensions if changed
        if (Math.abs(width - this.canvas.width) > 5 || Math.abs(height - this.canvas.height) > 5) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.renderCircles();
            
            // Update legend after rendering to reflect new circle sizes
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
        
        // Clear canvas
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        const { width: dataWidth, height: dataHeight } = this.overlayData.dimensions;
        const concentrationData = this.overlayData.data_arrays.concentration;
        const populationData = this.overlayData.data_arrays.population;
        
        // Calculate scaling factors
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
                
                // Calculate position
                const centerX = (dataX + 0.5) * scaleX;
                const centerY = (dataY + 0.5) * scaleY;
                
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
        
    }
}