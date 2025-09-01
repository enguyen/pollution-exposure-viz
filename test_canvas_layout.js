#!/usr/bin/env node

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
    
    // Test scenarios with realistic asset sizes
    const testCases = [
        {
            name: "TEST 1: Small asset centered, zoom 9",
            assetBounds: { north: -23.533, south: -23.567, east: -46.633, west: -46.667 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 9,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 2: Large asset centered, zoom 10", 
            assetBounds: { north: -23.4, south: -23.7, east: -46.5, west: -46.8 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 10,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 3: Large asset centered, zoom 12",
            assetBounds: { north: -23.4, south: -23.7, east: -46.5, west: -46.8 },
            mapCenter: { lat: -23.55, lng: -46.65 },
            zoom: 12,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 4: Large asset off-center, zoom 11",
            assetBounds: { north: -23.4, south: -23.7, east: -46.5, west: -46.8 },
            mapCenter: { lat: -23.45, lng: -46.55 }, // Shifted northwest
            zoom: 11,
            viewport: { width: 1920, height: 1080 }
        },
        {
            name: "TEST 5: Large asset far off-center, zoom 11",
            assetBounds: { north: -23.4, south: -23.7, east: -46.5, west: -46.8 },
            mapCenter: { lat: -23.3, lng: -46.4 }, // Much further northwest
            zoom: 11,
            viewport: { width: 1920, height: 1080 }
        }
    ];
    
    let totalAssertions = 0;
    let passedAssertions = 0;
    
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
        
        if (index + 1 === 1) { // TEST 1: Small asset centered, zoom 9
            assertions.push({ 
                name: "Data center should be at viewport center", 
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540", // viewport center
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be fully visible (small asset)",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "100.0%",
                passes: layout.visibility.visiblePercent > 99.0
            });
        }
        
        if (index + 1 === 2) { // TEST 2: Large asset centered, zoom 10
            assertions.push({
                name: "Data center should be at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be significantly larger than previous test",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: ">100x100 pixels",
                passes: layout.canvasSize.width > 100 && layout.canvasSize.height > 100
            });
        }
        
        if (index + 1 === 3) { // TEST 3: Large asset centered, zoom 12  
            assertions.push({
                name: "Data center should be at viewport center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) < 10 && Math.abs(layout.dataCenterPosition.y - 540) < 10
            });
            assertions.push({
                name: "Canvas should be very large at zoom 12",
                actual: `${layout.canvasSize.width.toFixed(0)}x${layout.canvasSize.height.toFixed(0)}`,
                expected: ">400x400 pixels",
                passes: layout.canvasSize.width > 400 && layout.canvasSize.height > 400
            });
        }
        
        if (index + 1 === 4) { // TEST 4: Large asset off-center, zoom 11
            assertions.push({
                name: "Data center should be off-center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "NOT 960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) > 50 || Math.abs(layout.dataCenterPosition.y - 540) > 50
            });
            assertions.push({
                name: "Canvas should be partially visible",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "20-80%",
                passes: layout.visibility.visiblePercent > 20 && layout.visibility.visiblePercent < 80
            });
        }
        
        if (index + 1 === 5) { // TEST 5: Large asset far off-center, zoom 11
            assertions.push({
                name: "Data center should be very off-center",
                actual: `${layout.dataCenterPosition.x.toFixed(0)},${layout.dataCenterPosition.y.toFixed(0)}`,
                expected: "NOT 960,540",
                passes: Math.abs(layout.dataCenterPosition.x - 960) > 200 || Math.abs(layout.dataCenterPosition.y - 540) > 200
            });
            assertions.push({
                name: "Canvas should have limited or no visibility",
                actual: `${layout.visibility.visiblePercent.toFixed(1)}%`,
                expected: "<30%",
                passes: layout.visibility.visiblePercent < 30
            });
        }
        
        // Run assertions
        assertions.forEach(assertion => {
            totalAssertions++;
            if (assertion.passes) passedAssertions++;
            
            const status = assertion.passes ? "✓ PASS" : "✗ FAIL";
            console.log(`${status}: ${assertion.name}`);
            console.log(`  Expected: ${assertion.expected}`);
            console.log(`  Actual: ${assertion.actual}`);
        });
        
        if (assertions.length === 0) {
            console.log("No specific assertions for this test case");
        }
    });
    
    console.log("\n=== TEST SUMMARY ===");
    console.log(`Total Assertions: ${totalAssertions}`);
    console.log(`Passed: ${passedAssertions}`);
    console.log(`Failed: ${totalAssertions - passedAssertions}`);
    console.log(`Success Rate: ${((passedAssertions / totalAssertions) * 100).toFixed(1)}%`);
    console.log("=== END TESTS ===");
}

// Run the tests
testCanvasLayout();