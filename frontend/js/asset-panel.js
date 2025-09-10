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
            
            ${overlayData ? generateHealthRiskSection(overlayData.exposure_analysis) : '<div class="alert alert-info">Loading exposure data...</div>'}
            
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

// Generate health risk visualization section
function generateHealthRiskSection(exposureAnalysis) {
    if (!exposureAnalysis || !exposureAnalysis.buckets) {
        return '<div class="text-muted">No exposure data available</div>';
    }
    
    return `
        <div class="exposure-panel mb-3">
            <h6 class="mb-2">Population Exposure Analysis</h6>
            <div class="total-population mb-3">
                <strong>Total Exposed: ${formatNumberWithUnit(exposureAnalysis.total_exposed_population)} people</strong>
            </div>
            
            ${generateHealthRiskBars(exposureAnalysis)}
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