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
                        <button class="btn btn-dark-gray btn-sm w-100" onclick="learnMoreAboutAsset()">
                            Learn more about this asset
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
// Colors updated to match Pollution Map Viz Best Practices document
const NEW_RISK_DEFINITIONS = [
    { min: 0, max: 2.5, key: "0-2.5", label: "Measurable Additional Risk (0-2.5)", color: "#9ACD32" },    // Yellow-Green
    { min: 2.5, max: 5.0, key: "2.5-5.0", label: "Low Additional Risk (2.5-5.0)", color: "#FFFF00" },     // Yellow
    { min: 5.0, max: 10.0, key: "5.0-10.0", label: "Moderate Additional Risk (5.0-10.0)", color: "#FFD700" }, // Orange-Yellow
    { min: 10.0, max: 25.0, key: "10.0-25.0", label: "High Additional Risk (10.0-25.0)", color: "#FFA500" },   // Orange
    { min: 25.0, max: 50.0, key: "25.0-50.0", label: "Very High Additional Risk (25.0-50.0)", color: "#FF0000" }, // Red
    { min: 50.0, max: Infinity, key: "50.0+", label: "Extreme Additional Risk (50.0+)", color: "#800080" }  // Purple/Maroon
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
    const bucketConcentrationSums = {}; // Track total concentration per bucket for weighted averages
    let totalExposed = 0;
    let pixelsProcessed = 0;
    
    // Initialize buckets
    riskDefinitions.forEach(def => {
        newBuckets[def.key] = 0;
        bucketConcentrationSums[def.key] = 0;
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
            
            // Process pixels with positive concentration and population
            if (concentration >= 0 && population > 0) {
                // Find appropriate bucket
                for (const def of riskDefinitions) {
                    // Handle inclusive ranges correctly
                    const inRange = (def.max === Infinity) ? 
                        (concentration >= def.min) : 
                        (concentration >= def.min && concentration < def.max);
                        
                    if (inRange) {
                        newBuckets[def.key] += population;
                        bucketConcentrationSums[def.key] += concentration * population; // Weighted sum
                        totalExposed += population;
                        break;
                    }
                }
            }
        }
    }
    
    // Remove empty buckets and calculate weighted averages
    const filteredBuckets = {};
    const filteredMetadata = {};
    const bucketAverages = {};
    
    Object.keys(newBuckets).forEach(key => {
        if (newBuckets[key] > 0) {
            filteredBuckets[key] = newBuckets[key];
            filteredMetadata[key] = newBucketMetadata[key];
            // Calculate weighted average concentration for this bucket
            bucketAverages[key] = bucketConcentrationSums[key] / newBuckets[key];
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
        bucket_averages: bucketAverages, // New: weighted average concentrations
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
    
    // Calculate overall average concentration
    let overallAverageConc = '';
    if (overlayData && overlayData.data && overlayData.data.concentration && overlayData.data.population) {
        const { concentration: concData, population: popData } = overlayData.data;
        let totalWeightedConc = 0;
        let totalPopulation = 0;
        
        for (let row = 0; row < concData.length; row++) {
            for (let col = 0; col < concData[row].length; col++) {
                const conc = concData[row][col];
                const pop = popData[row][col];
                if (conc >= 0 && pop > 0) {
                    totalWeightedConc += conc * pop;
                    totalPopulation += pop;
                }
            }
        }
        
        if (totalPopulation > 0) {
            const avgConc = totalWeightedConc / totalPopulation;
            overallAverageConc = `<br><small class="text-muted">Average additional PM2.5: ${avgConc.toFixed(2)} μg/m³</small>`;
        }
    }

    return `
        <div class="exposure-panel mb-3">
            <h6 class="mb-2">Population Exposure Analysis</h6>
            <div class="total-population mb-3">
                <strong>Total Exposed: ${formatNumberWithUnit(finalAnalysis.total_exposed_population)} people</strong>
                ${overallAverageConc}
            </div>
            
            ${finalAnalysis.bucket_averages ? generateVariableHeightBars(finalAnalysis) : generateHealthRiskBars(finalAnalysis)}
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
    
    // Process buckets in risk order (dynamically from bucket_metadata)
    // Use bucket_metadata order if available, otherwise fall back to hardcoded order
    let bucketOrder;
    if (bucket_metadata && Object.keys(bucket_metadata).length > 0) {
        // Sort by the minimum value in range_ugm3 to ensure proper risk order
        bucketOrder = Object.keys(bucket_metadata).sort((a, b) => {
            const aMin = bucket_metadata[a].range_ugm3[0];
            const bMin = bucket_metadata[b].range_ugm3[0];
            return aMin - bMin;
        });
    } else {
        // Fallback for legacy data
        bucketOrder = ['0-2.5', '2.5-5.0', '5.0-10.0', '10.0-25.0', '25.0-50.0', '50.0+'];
    }
    
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

// Generate variable-height bar chart (width = population, height = average concentration)
function generateVariableHeightBars(exposureAnalysis) {
    const { buckets, bucket_metadata, bucket_averages, total_exposed_population } = exposureAnalysis;
    
    if (!buckets || !bucket_averages || Object.keys(buckets).length === 0) {
        return '';
    }
    
    // Find maximum values for scaling
    const maxPopulation = Math.max(...Object.values(buckets));
    const maxAverageConcentration = Math.max(...Object.values(bucket_averages));
    const maxHeight = 200; // Max height in pixels as requested
    
    // Dynamic bucket ordering 
    let bucketOrder;
    if (bucket_metadata && Object.keys(bucket_metadata).length > 0) {
        bucketOrder = Object.keys(bucket_metadata).sort((a, b) => {
            const aMin = bucket_metadata[a].range_ugm3[0];
            const bMin = bucket_metadata[b].range_ugm3[0];
            return aMin - bMin;
        });
    } else {
        bucketOrder = ['0-2.5', '2.5-5.0', '5.0-10.0', '10.0-25.0', '25.0-50.0', '50.0+'];
    }
    
    let barsHtml = '';
    
    for (const bucketKey of bucketOrder) {
        if (!(bucketKey in buckets) || buckets[bucketKey] === 0) continue;
        
        const population = buckets[bucketKey];
        const averageConc = bucket_averages[bucketKey];
        const metadata = bucket_metadata[bucketKey];
        const percentage = (population / total_exposed_population * 100).toFixed(1);
        
        // Calculate dimensions
        const barWidth = (population / maxPopulation * 100).toFixed(1);
        const barHeight = (averageConc / maxAverageConcentration * maxHeight).toFixed(1);
        
        // Extract concentration range for display
        const rangeDisplay = bucketKey.includes('+') ? 
            `${bucketKey.split('+')[0]}+μg/m³` : 
            `${bucketKey}μg/m³`;
            
        barsHtml += `
            <div class="variable-height-category mb-2">
                <div class="d-flex justify-content-between mb-1">
                    <span class="risk-label" style="font-size: 0.85rem;">${rangeDisplay}</span>
                    <span class="risk-stats" style="font-size: 0.85rem;">
                        ${formatNumberWithUnit(population)} exposed (${percentage}%)
                    </span>
                </div>
                <div class="variable-height-bar" 
                     style="width: ${barWidth}%; 
                            height: ${barHeight}px; 
                            background-color: ${metadata.color};"
                     title="${metadata.label}: ${formatNumberWithUnit(population)} people exposed, average ${averageConc.toFixed(1)} μg/m³">
                </div>
            </div>
        `;
    }
    
    return `
        <div>
            <h6 class="mb-2">Population Exposure by Risk Category</h6>
            <div class="text-muted mb-3" style="font-size: 0.8rem;">
                Bar width = population count • Bar height = average PM2.5 concentration
            </div>
            ${barsHtml}
        </div>
    `;
}


// Open Climate TRACE page for selected asset
function learnMoreAboutAsset() {
    if (selectedAsset && selectedAsset.asset_id) {
        const climateTraceUrl = `https://climatetrace.org/explore#asset=${selectedAsset.asset_id}`;
        window.open(climateTraceUrl, '_blank');
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