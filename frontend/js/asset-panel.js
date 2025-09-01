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

// Calculate statistics across all assets for comparison
function calculateGlobalStats() {
    if (!assetsData) return null;
    
    const totalExposures = assetsData.assets.map(a => a.person_exposure_stats.total_person_exposure);
    const nonZeroExposures = totalExposures.filter(e => e > 0);
    
    return {
        totalAssets: assetsData.assets.length,
        totalExposure: totalExposures.reduce((sum, e) => sum + e, 0),
        meanExposure: nonZeroExposures.reduce((sum, e) => sum + e, 0) / nonZeroExposures.length,
        maxExposure: Math.max(...totalExposures),
        minExposure: Math.min(...nonZeroExposures),
        percentiles: {
            p10: d3.quantile(nonZeroExposures.sort((a, b) => a - b), 0.1),
            p25: d3.quantile(nonZeroExposures.sort((a, b) => a - b), 0.25),
            p50: d3.quantile(nonZeroExposures.sort((a, b) => a - b), 0.5),
            p75: d3.quantile(nonZeroExposures.sort((a, b) => a - b), 0.75),
            p90: d3.quantile(nonZeroExposures.sort((a, b) => a - b), 0.9)
        }
    };
}

// Get asset rank by total person-exposure
function getAssetRank(asset) {
    if (!assetsData) return null;
    
    const totalExposures = assetsData.assets
        .map(a => a.person_exposure_stats.total_person_exposure)
        .sort((a, b) => b - a); // Descending order
    
    const assetExposure = asset.person_exposure_stats.total_person_exposure;
    const rank = totalExposures.indexOf(assetExposure) + 1;
    const percentile = ((totalExposures.length - rank + 1) / totalExposures.length) * 100;
    
    return {
        rank,
        total: totalExposures.length,
        percentile: percentile.toFixed(1)
    };
}

// Enhanced asset details with global context
function updateAssetDetailsPanel(asset) {
    const exposureStats = asset.person_exposure_stats;
    const bounds = asset.bounds;
    const globalStats = calculateGlobalStats();
    const assetRank = getAssetRank(asset);
    
    const detailsHtml = `
        <div class="asset-details">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">Asset ${asset.asset_id}</h5>
                <span class="badge fs-6" style="background-color: ${countryColors[asset.country] || '#666'}">${asset.country}</span>
            </div>
            
            ${assetRank ? `
            <div class="alert alert-info p-2 mb-3">
                <small>
                    <strong>Rank:</strong> #${assetRank.rank} of ${assetRank.total} assets 
                    (${assetRank.percentile}th percentile)
                </small>
            </div>
            ` : ''}
            
            <div class="stats-grid mb-3">
                <div class="stat-card">
                    <div class="stat-value">${formatNumberWithUnit(exposureStats.total_person_exposure)}</div>
                    <div class="stat-label">Total Person-Exposure</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${exposureStats.non_zero_pixels.toLocaleString()}</div>
                    <div class="stat-label">Exposed Pixels</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatNumberWithUnit(exposureStats.max_person_exposure)}</div>
                    <div class="stat-label">Max Exposure</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatNumberWithUnit(exposureStats.non_zero_mean)}</div>
                    <div class="stat-label">Mean (Non-zero)</div>
                </div>
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
                <div class="row mb-1">
                    <div class="col-4"><strong>Total Pixels:</strong></div>
                    <div class="col-8">${asset.total_pixels.toLocaleString()}</div>
                </div>
                <div class="row mb-1">
                    <div class="col-4"><strong>Processed:</strong></div>
                    <div class="col-8">${new Date(asset.processed_date).toLocaleDateString()}</div>
                </div>
            </div>
            
            <div class="pixel-counts">
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Concentration Distribution</h6>
                        <small class="text-muted">μg/m³</small>
                    </div>
                    ${generatePixelBars(asset.concentration_pixel_counts, 'concentration')}
                </div>
                
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Population Distribution</h6>
                        <small class="text-muted">people/pixel</small>
                    </div>
                    ${generatePixelBars(asset.population_pixel_counts, 'population')}
                </div>
                
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Person-Exposure Distribution</h6>
                        <small class="text-muted">person·μg/m³</small>
                    </div>
                    ${generatePixelBars(asset.person_exposure_pixel_counts, 'exposure')}
                </div>
            </div>
            
            <div class="legend">
                <div class="legend-title">Asset Size Legend</div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-xs" style="background-color: ${countryColors[asset.country] || '#666'};"></div>
                    Low exposure (≤25th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-sm" style="background-color: ${countryColors[asset.country] || '#666'};"></div>
                    Medium-low (25-50th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-md" style="background-color: ${countryColors[asset.country] || '#666'};"></div>
                    Medium (50-75th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-lg" style="background-color: ${countryColors[asset.country] || '#666'};"></div>
                    High (75-90th percentile)
                </div>
                <div class="legend-item">
                    <div class="legend-color asset-marker-xl" style="background-color: ${countryColors[asset.country] || '#666'};"></div>
                    Very high (≥90th percentile)
                </div>
            </div>
            
            ${globalStats ? `
            <div class="mt-3 pt-3" style="border-top: 1px solid #dee2e6;">
                <h6>Global Context</h6>
                <div style="font-size: 0.8rem;">
                    <div class="row mb-1">
                        <div class="col-6">Global Mean:</div>
                        <div class="col-6">${formatNumberWithUnit(globalStats.meanExposure)}</div>
                    </div>
                    <div class="row mb-1">
                        <div class="col-6">Global Max:</div>
                        <div class="col-6">${formatNumberWithUnit(globalStats.maxExposure)}</div>
                    </div>
                    <div class="row mb-1">
                        <div class="col-6">Median (50th):</div>
                        <div class="col-6">${formatNumberWithUnit(globalStats.percentiles.p50)}</div>
                    </div>
                </div>
            </div>
            ` : ''}
            
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

// Enhanced pixel bar generation with better formatting
function generatePixelBars(pixelCounts, type) {
    const totalPixels = Object.values(pixelCounts).reduce((sum, count) => sum + count, 0);
    const colorClass = `${type}-bar`;
    
    let barsHtml = '';
    const ranges = Object.entries(pixelCounts).filter(([range, count]) => count > 0);
    
    for (const [range, count] of ranges) {
        const percentage = (count / totalPixels) * 100;
        const width = Math.max(percentage, 5); // Minimum 5% width for visibility
        
        // Format the range label
        let rangeLabel = range;
        if (range !== '0' && !range.includes('+')) {
            const [min, max] = range.split('-');
            rangeLabel = `${parseFloat(min)}-${parseFloat(max)}`;
        }
        
        barsHtml += `
            <div class="pixel-bar mb-1" title="${rangeLabel}: ${count.toLocaleString()} pixels (${percentage.toFixed(1)}%)">
                <div class="pixel-bar-fill ${colorClass}" style="width: ${width}%">
                    <span style="font-size: 0.75rem;">
                        ${rangeLabel}: ${count.toLocaleString()} 
                        <small>(${percentage.toFixed(1)}%)</small>
                    </span>
                </div>
            </div>
        `;
    }
    
    return barsHtml || '<div class="text-muted">No data available</div>';
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
        exposure_stats: selectedAsset.person_exposure_stats,
        concentration_distribution: selectedAsset.concentration_pixel_counts,
        population_distribution: selectedAsset.population_pixel_counts,
        exposure_distribution: selectedAsset.person_exposure_pixel_counts
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asset_${selectedAsset.country}_${selectedAsset.asset_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
}