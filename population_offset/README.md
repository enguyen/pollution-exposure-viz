# Population TIFF Coordinate Offset Issue

## Problem Description

The three population TIFF files in this directory contain the same underlying population data, but positioned at different geographic coordinates. This causes population circles to appear in different screen locations when switching between assets in the frontend, even though they should remain stationary (as the same population doesn't move).

## Files

- `1566584-pop-v3.tiff` - Population data for CHN asset 1566584
- `1566601-pop-v3.tiff` - Population data for CHN asset 1566601  
- `38089178-pop-v3.tiff` - Population data for CHN asset 38089178
- `analyze_offsets.py` - Script to demonstrate the coordinate offset issue

## Analysis Results

Running `python3 analyze_offsets.py` shows:

```
1566584: 32.188335°N, 118.744999°E
1566601: 31.905000°N, 118.611667°E  
38089178: 31.708334°N, 118.475002°E

OFFSETS FROM 1566601:
1566584: 33.9km N (+31.5km N, +12.6km E)
38089178: 25.4km SW (-21.9km N, -12.9km E)
```

## Key Findings

1. **Same Population Values**: All three TIFFs contain identical population value distributions (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 3.0, 0.8, 0.6, 1.5 people per pixel)

2. **Different Coordinates**: The same population patterns appear at different geographic locations:
   - Asset 1566584: ~34km northeast of reference position
   - Asset 38089178: ~25km southwest of reference position

3. **Substantial Overlap**: Despite offsets, the TIFFs have 65-84% geographic overlap, confirming they should contain the same population data in overlapping regions

## Impact

This coordinate system bug causes:
- Population circles to shift positions when switching between assets
- Incorrect visualization of where people actually live relative to pollution sources
- Difficulty in comparing pollution impact across different assets

## Root Cause

The issue appears to be in the TIFF georeference/coordinate assignment process, where the same population dataset is being positioned at different geographic coordinates for each asset, rather than maintaining consistent spatial alignment.