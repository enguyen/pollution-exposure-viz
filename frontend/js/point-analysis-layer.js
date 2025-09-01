// Point Analysis Visual Layer
class PointAnalysisLayer extends L.Layer {
    constructor(analysisPoint, contributingAssets) {
        super();
        this.analysisPoint = analysisPoint;
        this.contributingAssets = contributingAssets || [];
        this.canvas = null;
        this.ctx = null;
        this.animationFrame = null;
        this.animationTime = 0;
        this.animationSpeed = 0.005; // Very slow, subtle animation
    }
    
    addTo(map) {
        this.map = map;
        this.createCanvas();
        this.updateCanvasPosition();
        this.startAnimation();
        
        // Add event listeners for map updates
        this._onViewReset = this.updateCanvasPosition.bind(this);
        this._onMove = this.updateCanvasPosition.bind(this);
        this._onZoom = this.updateCanvasPosition.bind(this);
        
        map.on('viewreset', this._onViewReset);
        map.on('move', this._onMove);
        map.on('zoom', this._onZoom);
        
        console.log('PointAnalysisLayer added to map, canvas size:', this.canvas.width, 'x', this.canvas.height);
        
        return this;
    }
    
    removeFrom(map) {
        // Stop animation first
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Remove canvas from DOM
        if (this.canvas) {
            if (this.canvas.parentNode) {
                this.canvas.parentNode.removeChild(this.canvas);
            }
            this.canvas = null;
            this.ctx = null;
        }
        
        // Remove event listeners
        if (map && this._onViewReset) {
            map.off('viewreset', this._onViewReset);
            map.off('move', this._onMove);
            map.off('zoom', this._onZoom);
        }
        
        // Clear references
        this._onViewReset = null;
        this._onMove = null;
        this._onZoom = null;
        
        return this;
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1100'; // Above asset overlays and markers
        
        this.ctx = this.canvas.getContext('2d');
        
        // Add canvas to Leaflet's overlay pane for proper coordinate system
        const overlayPane = this.map.getPane('overlayPane');
        overlayPane.appendChild(this.canvas);
    }
    
    updateCanvasPosition() {
        if (!this.canvas) return;
        
        // Copy exact approach from main asset overlay - use layer points directly
        const mapSize = this.map.getSize();
        
        // Position canvas at (0,0) in layer point coordinate system  
        this.canvas.style.left = '0px';
        this.canvas.style.top = '0px';
        this.canvas.width = mapSize.x;
        this.canvas.height = mapSize.y;
    }
    
    updateContributingAssets(contributingAssets) {
        this.contributingAssets = contributingAssets;
    }
    
    startAnimation() {
        const animate = () => {
            this.animationTime += this.animationSpeed;
            if (this.animationTime > 1) {
                this.animationTime = 0; // Reset animation for dash pattern
            }
            
            this.render();
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    render() {
        if (!this.ctx || !this.analysisPoint) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Copy exact approach from main asset overlay - use layer points directly
        const pointScreen = this.map.latLngToLayerPoint(this.analysisPoint.latlng);
        
        // Draw animated lines from contributing assets
        this.contributingAssets.forEach((contributingAsset, index) => {
            const assetCenter = {
                lat: contributingAsset.asset.center_lat,
                lng: contributingAsset.asset.center_lon
            };
            const assetScreen = this.map.latLngToLayerPoint(assetCenter);
            const concentration = contributingAsset.contribution.concentration;
            
            // Check if getConcentrationColor function is available
            let color = '#FF0000'; // Default red fallback
            if (typeof window.getConcentrationColor === 'function') {
                color = window.getConcentrationColor(concentration);
            } else {
                console.warn('getConcentrationColor function not available, using fallback color');
            }
            
            this.drawAnimatedLine(assetScreen.x, assetScreen.y, pointScreen.x, pointScreen.y, color, concentration);
        });

        // Draw reticle at analysis point (no coordinate adjustment needed)
        this.drawReticle(pointScreen.x, pointScreen.y);
    }
    
    drawReticle(x, y) {
        const size = 30;
        const innerSize = 10;
        
        // Save current context state
        this.ctx.save();
        
        // Draw shadow first
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 3;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        this.ctx.strokeStyle = '#FF0000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        // Horizontal line
        this.ctx.moveTo(x - size, y);
        this.ctx.lineTo(x - innerSize, y);
        this.ctx.moveTo(x + innerSize, y);
        this.ctx.lineTo(x + size, y);
        
        // Vertical line
        this.ctx.moveTo(x, y - size);
        this.ctx.lineTo(x, y - innerSize);
        this.ctx.moveTo(x, y + innerSize);
        this.ctx.lineTo(x, y + size);
        
        this.ctx.stroke();
        
        // Add small circle at center
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#FF0000';
        this.ctx.fill();
        
        // Restore context state (removes shadow for subsequent drawing)
        this.ctx.restore();
    }
    
    drawAnimatedLine(fromX, fromY, toX, toY, color, concentration) {
        // Scale line thickness based on concentration (1px minimum, 8px maximum)
        const minThickness = 3;
        const maxThickness = 25;
        const maxConcentration = 100;
        const logScaledConcentration = Math.min(concentration, maxConcentration)^0.5;
        const thickness = minThickness + (logScaledConcentration / maxConcentration) * (maxThickness - minThickness);
        
        // Save current context state
        this.ctx.save();
        
        // Add drop shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = thickness;
        this.ctx.lineCap = 'round';
        
        // Create subtle animated dash pattern - the dash pattern moves slowly to show direction
        const dashLength = 2 * thickness;
        const gapLength = 1.25 * thickness;
        const dashOffset = this.animationTime * (dashLength + gapLength);
        
        this.ctx.setLineDash([dashLength, gapLength]);
        this.ctx.lineDashOffset = -dashOffset; // Negative for asset→point direction
        
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();
        
        // Reset line dash for other drawing
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
        
        // Restore context state (removes shadow for subsequent drawing)
        this.ctx.restore();
    }
}