// Asset panel functionality and utilities

// Enhanced number formatting with units
function formatNumberWithUnit(num, unit = '') {
    if (num === 0) return `0${unit}`;
    
    const absNum = Math.abs(num);
    let formatted;
    
    if (absNum < 0.001) {
        formatted = num.toExponential(2);
    } else if (absNum < 1) {
        formatted = num.toFixed(3);
    } else if (absNum < 10) {
        formatted = num.toFixed(2);
    } else if (absNum < 100) {
        formatted = num.toFixed(1);
    } else if (absNum < 1000) {
        formatted = Math.round(num).toString();
    } else if (absNum < 1000000) {
        formatted = (num / 1000).toFixed(1) + 'K';
    } else if (absNum < 1000000000) {
        formatted = (num / 1000000).toFixed(1) + 'M';
    } else {
        formatted = (num / 1000000000).toFixed(1) + 'B';
    }
    
    return formatted + unit;
}



// Enhanced asset details with health risk visualization
function updateAssetDetailsPanel(asset, overlayData = null) {
    const bounds = asset.bounds;
    
    const detailsHtml = `
        <div class="asset-details">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">Asset ${asset.asset_id}</h5>
                <span class="badge fs-6" style="background-color: ${countryColors[asset.country] || '#666'}">${asset.country}</span>
            </div>
            
            <div class="mb-3" style="font-size: 0.9rem;">
                <div class="row mb-1">
                    <div class="col-4"><strong>Location:</strong></div>
                    <div class="col-8">${asset.center_lat.toFixed(4)}°, ${asset.center_lon.toFixed(4)}°</div>
                </div>
                <div class="row mb-1">
                    <div class="col-4"><strong>Coverage:</strong></div>
                    <div class="col-8">${((bounds.right - bounds.left) * 111).toFixed(1)} × ${((bounds.top - bounds.bottom) * 111).toFixed(1)} km</div>
                </div>
            </div>
            
            ${overlayData ? generateHealthRiskSection(overlayData.exposure_analysis, overlayData) : '<div class="alert alert-info">Loading exposure data...</div>'}
            
            <div class="mt-3">
                <div class="row">
                    <div class="col-6">
                        <button class="btn btn-primary btn-sm w-100" onclick="focusOnAsset()">
                            Center Map
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('asset-details').innerHTML = detailsHtml;
}

// Performance tracking for re-aggregation
const performanceMetrics = {
    reAggregationTimes: [],
    totalPixelsProcessed: 0,
    totalReAggregations: 0
};

// Updated science-based risk bucket definitions (2024 Best Practices)
const NEW_RISK_DEFINITIONS = [
    { min: 0, max: 2.5, key: "0-2.5", label: "Measurable Additional Risk (0-2.5)", color: "#90EE90" },
    { min: 2.5, max: 5.0, key: "2.5-5.0", label: "Low Additional Risk (2.5-5.0)", color: "#ADFF2F" },
    { min: 5.0, max: 10.0, key: "5.0-10.0", label: "Moderate Additional Risk (5.0-10.0)", color: "#FFFF00" },
    { min: 10.0, max: 25.0, key: "10.0-25.0", label: "High Additional Risk (10.0-25.0)", color: "#FFA500" },
    { min: 25.0, max: 50.0, key: "25.0-50.0", label: "Very High Additional Risk (25.0-50.0)", color: "#FF0000" },
    { min: 50.0, max: Infinity, key: "50.0+", label: "Extreme Additional Risk (50.0+)", color: "#800080" }
];

// Frontend re-aggregation with performance instrumentation
function recalculateExposureBuckets(overlayData, useNewDefinitions = false) {
    const startTime = performance.now();
    
    console.log("🔄 Starting frontend re-aggregation...");
    
    const concentrationData = overlayData.data.concentration;
    const populationData = overlayData.data.population;
    
    if (!concentrationData || !populationData) {
        console.warn("❌ Missing raw data for re-aggregation, using pre-computed buckets");
        return overlayData.exposure_analysis;
    }
    
    const riskDefinitions = useNewDefinitions ? NEW_RISK_DEFINITIONS : [
        { min: 0, max: 12, key: "0-12", label: "Low Additional Risk (0-12)", color: "#FFF45C" },
        { min: 12, max: 35, key: "12-35", label: "Elevated Additional Risk (12-35)", color: "#FFA500" },
        { min: 35, max: 55, key: "35-55", label: "Significant Additional Risk (35-55)", color: "#FF6347" },
        { min: 55, max: 150, key: "55-150", label: "High Additional Risk (55-150)", color: "#FF0000" },
        { min: 150, max: 250, key: "150-250", label: "Very High Additional Risk (150-250)", color: "#8B0000" },
        { min: 250, max: Infinity, key: "250+", label: "Extreme Additional Risk (250+)", color: "#800080" }
    ];
    
    const newBuckets = {};
    const newBucketMetadata = {};
    let totalExposed = 0;
    let pixelsProcessed = 0;
    
    // Initialize buckets
    riskDefinitions.forEach(def => {
        newBuckets[def.key] = 0;
        newBucketMetadata[def.key] = {
            label: def.label,
            color: def.color,
            range_ugm3: def.max === Infinity ? [def.min, "inf"] : [def.min, def.max]
        };
    });
    
    // Process all pixels
    for (let row = 0; row < concentrationData.length; row++) {
        for (let col = 0; col < concentrationData[row].length; col++) {
            pixelsProcessed++;
            
            const concentration = concentrationData[row][col];
            const population = populationData[row][col];
            
            // Only process pixels with positive concentration and population
            if (concentration > 0 && population > 0) {
                // Find appropriate bucket
                for (const def of riskDefinitions) {
                    if (concentration >= def.min && concentration < def.max) {
                        newBuckets[def.key] += population;
                        totalExposed += population;
                        break;
                    }
                }
            }
        }
    }
    
    // Remove empty buckets
    const filteredBuckets = {};
    const filteredMetadata = {};
    Object.keys(newBuckets).forEach(key => {
        if (newBuckets[key] > 0) {
            filteredBuckets[key] = newBuckets[key];
            filteredMetadata[key] = newBucketMetadata[key];
        }
    });
    
    const endTime = performance.now();
    const processingTime = endTime - startTime;
    
    // Track performance metrics
    performanceMetrics.reAggregationTimes.push(processingTime);
    performanceMetrics.totalPixelsProcessed += pixelsProcessed;
    performanceMetrics.totalReAggregations++;
    
    // Log performance data
    console.log(`⚡ Re-aggregation completed in ${processingTime.toFixed(2)}ms`);
    console.log(`📊 Processed ${pixelsProcessed.toLocaleString()} pixels`);
    console.log(`🏃‍♂️ Processing rate: ${(pixelsProcessed / processingTime * 1000).toLocaleString()} pixels/second`);
    console.log(`📈 Total exposed population: ${formatNumberWithUnit(totalExposed)}`);
    
    // Log cumulative statistics
    const avgTime = performanceMetrics.reAggregationTimes.reduce((a, b) => a + b, 0) / performanceMetrics.reAggregationTimes.length;
    const maxTime = Math.max(...performanceMetrics.reAggregationTimes);
    console.log(`📉 Performance summary (${performanceMetrics.totalReAggregations} runs):`);
    console.log(`   Average: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
    console.log(`   Total pixels processed: ${performanceMetrics.totalPixelsProcessed.toLocaleString()}`);
    
    return {
        buckets: filteredBuckets,
        bucket_metadata: filteredMetadata,
        total_exposed_population: totalExposed,
        bucket_ranges_ugm3: riskDefinitions.map(def => [def.min, def.max === Infinity ? "inf" : def.max]),
        description: `Population count by PM2.5 concentration risk categories (${useNewDefinitions ? 'NEW' : 'ORIGINAL'} definitions, frontend re-aggregated)`,
        processing_time_ms: processingTime,
        pixels_processed: pixelsProcessed
    };
}

// Generate health risk visualization section
function generateHealthRiskSection(exposureAnalysis, overlayData = null) {
    if (!exposureAnalysis || !exposureAnalysis.buckets) {
        return '<div class="text-muted">No exposure data available</div>';
    }
    
    // Use new science-based risk definitions with frontend re-aggregation
    const useReAggregation = true; // Enable frontend re-aggregation with new buckets
    const finalAnalysis = (useReAggregation && overlayData) ? 
        recalculateExposureBuckets(overlayData, true) : exposureAnalysis;
    
    return `
        <div class="exposure-panel mb-3">
            <h6 class="mb-2">Population Exposure Analysis</h6>
            <div class="total-population mb-3">
                <strong>Total Exposed: ${formatNumberWithUnit(finalAnalysis.total_exposed_population)} people</strong>
                ${finalAnalysis.processing_time_ms ? `<br><small class="text-muted">Re-aggregated in ${finalAnalysis.processing_time_ms.toFixed(1)}ms</small>` : ''}
            </div>
            
            ${generateHealthRiskBars(finalAnalysis)}
            
            ${useReAggregation ? '<div class="alert alert-info mt-2"><small>⚡ Using 2024 science-based risk categories (frontend re-aggregated)</small></div>' : ''}
        </div>
    `;
}

// Generate individual health risk bar components
function generateHealthRiskBars(exposureAnalysis) {
    const { buckets, bucket_metadata, total_exposed_population } = exposureAnalysis;
    
    if (!buckets || Object.keys(buckets).length === 0) {
        return '<div class="text-muted">No population exposed to PM2.5</div>';
    }
    
    // Find maximum population for scaling bars
    const maxPopulation = Math.max(...Object.values(buckets));
    
    let barsHtml = '';
    
    // Process buckets in risk order
    const bucketOrder = ['0-12', '12-35', '35-55', '55-150', '150-250', '250+'];
    
    for (const bucketKey of bucketOrder) {
        if (!(bucketKey in buckets) || buckets[bucketKey] === 0) continue;
        
        const population = buckets[bucketKey];
        const metadata = bucket_metadata[bucketKey];
        const percentage = (population / total_exposed_population * 100).toFixed(1);
        const barWidth = (population / maxPopulation * 100).toFixed(1);
        
        barsHtml += `
            <div class="risk-category mb-2">
                <div class="d-flex justify-content-between mb-1">
                    <span class="risk-label" style="font-size: 0.9rem;">${metadata.label}</span>
                    <span class="risk-count" style="font-size: 0.9rem; font-weight: 600;">
                        ${formatNumberWithUnit(population)} (${percentage}%)
                    </span>
                </div>
                <div class="risk-bar-container">
                    <div class="risk-bar" style="width: ${barWidth}%; background-color: ${metadata.color}"></div>
                </div>
            </div>
        `;
    }
    
    return barsHtml || '<div class="text-muted">No population exposed to PM2.5</div>';
}


// Focus map on selected asset
function focusOnAsset() {
    if (selectedAsset && map) {
        map.setView([selectedAsset.center_lat, selectedAsset.center_lon], 10);
    }
}

// Export asset data (optional enhancement)
function exportAssetData() {
    if (!selectedAsset) return;
    
    const data = {
        asset_id: selectedAsset.asset_id,
        country: selectedAsset.country,
        location: {
            lat: selectedAsset.center_lat,
            lon: selectedAsset.center_lon
        },
        bounds: selectedAsset.bounds,
        // Include exposure analysis if available
        exposure_analysis: selectedAsset.exposure_analysis || null
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asset_${selectedAsset.country}_${selectedAsset.asset_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Testing utilities for performance benchmarking
window.testReAggregation = function() {
    if (!selectedAsset) {
        console.log("❌ No asset selected. Click on an asset first.");
        return;
    }
    
    console.log("🧪 Testing frontend re-aggregation performance...");
    
    // Load overlay data and test re-aggregation
    loadOverlayDataForAsset(selectedAsset).then(overlayData => {
        if (!overlayData) {
            console.log("❌ Failed to load overlay data");
            return;
        }
        
        console.log("🔄 Testing current definitions...");
        const result1 = recalculateExposureBuckets(overlayData, false);
        
        console.log("🔄 Testing new definitions...");
        const result2 = recalculateExposureBuckets(overlayData, true);
        
        console.log("✅ Re-aggregation test complete!");
        console.log("💡 Call window.performanceMetrics to see cumulative stats");
    });
};

window.enableReAggregation = function() {
    console.log("🔧 Enabling frontend re-aggregation for current session...");
    // Force re-render with re-aggregation enabled
    if (selectedAsset) {
        loadOverlayDataForAsset(selectedAsset).then(overlayData => {
            updateAssetDetailsPanel(selectedAsset, overlayData);
        });
    }
};

// Expose performance metrics for inspection
window.performanceMetrics = performanceMetrics;