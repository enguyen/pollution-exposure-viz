#!/usr/bin/env python3
"""
Process the full dataset with the new unified pipeline.
Times the execution, backs up old files, and generates new overlays.
"""

import os
import json
import time
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from prototype_unified import process_asset_unified

def backup_old_overlays():
    """Backup existing overlay files to versioned directory"""
    
    overlays_dir = Path("overlays")
    if not overlays_dir.exists():
        print("No existing overlays directory found")
        return
    
    # Create backup directory with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = Path(f"overlays_backup_multistep_pipeline_{timestamp}")
    
    print(f"📦 Creating backup directory: {backup_dir}")
    
    # Move existing overlays to backup
    if overlays_dir.exists():
        shutil.move(str(overlays_dir), str(backup_dir))
        print(f"✅ Moved existing overlays to {backup_dir}")
        
        # Count files in backup
        backup_files = list(backup_dir.glob("*"))
        print(f"   📄 Backed up {len(backup_files)} files")
    
    # Recreate empty overlays directory
    overlays_dir.mkdir(exist_ok=True)
    print(f"✅ Created fresh overlays directory")
    
    return backup_dir

def load_all_assets():
    """Load all assets from assets.json"""
    
    with open('assets.json', 'r') as f:
        data = json.load(f)
    
    assets = data['assets']
    print(f"📊 Loaded {len(assets)} assets from assets.json")
    
    # Show country distribution
    countries = {}
    for asset in assets:
        country = asset['country']
        countries[country] = countries.get(country, 0) + 1
    
    print(f"🌍 Country distribution:")
    for country, count in sorted(countries.items()):
        print(f"   {country}: {count} assets")
    
    return assets

def process_single_asset(asset_info):
    """Process a single asset with error handling"""
    
    asset_id = asset_info['asset_id']
    country = asset_info['country']
    
    try:
        start_time = time.time()
        
        # Process with unified pipeline, output to overlays directory
        result = process_asset_unified(
            asset_id=asset_id,
            country=country,
            input_dir="input_geotiffs",
            output_dir="overlays",
            preserve_full_resolution=True,
            precision_digits=3
        )
        
        processing_time = time.time() - start_time
        
        # Calculate output file info
        output_file = Path("overlays") / f"{country}_{asset_id}_data.json"
        file_size_mb = output_file.stat().st_size / (1024 * 1024)
        
        return {
            'asset_id': asset_id,
            'country': country,
            'success': True,
            'processing_time': processing_time,
            'file_size_mb': file_size_mb,
            'dimensions': result['dimensions'],
            'total_population': result['exposure_analysis']['total_exposed_population'],
            'risk_buckets': len(result['exposure_analysis']['buckets'])
        }
        
    except Exception as e:
        return {
            'asset_id': asset_id,
            'country': country,
            'success': False,
            'error': str(e),
            'processing_time': 0,
            'file_size_mb': 0
        }

def process_full_dataset(max_workers=4):
    """Process all assets with parallel execution and timing"""
    
    print("🚀 FULL DATASET PROCESSING - UNIFIED PIPELINE")
    print("=" * 70)
    
    # Step 1: Backup old overlays
    backup_dir = backup_old_overlays()
    print()
    
    # Step 2: Load all assets
    assets = load_all_assets()
    print()
    
    # Step 3: Process all assets with timing
    print(f"⚡ Starting parallel processing with {max_workers} workers...")
    
    overall_start = time.time()
    results = []
    successful = 0
    failed = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_asset = {
            executor.submit(process_single_asset, asset): asset 
            for asset in assets
        }
        
        # Process results as they complete
        for i, future in enumerate(as_completed(future_to_asset)):
            result = future.result()
            results.append(result)
            
            if result['success']:
                successful += 1
                print(f"[{i+1:3d}/{len(assets)}] ✅ {result['country']}_{result['asset_id']} "
                      f"({result['processing_time']:.2f}s, {result['file_size_mb']:.1f}MB, "
                      f"{result['total_population']:,.0f} people)")
            else:
                failed += 1
                print(f"[{i+1:3d}/{len(assets)}] ❌ {result['country']}_{result['asset_id']} - {result['error']}")
    
    overall_time = time.time() - overall_start
    
    # Step 4: Calculate statistics
    print("\n" + "=" * 70)
    print("📊 PROCESSING COMPLETE")
    print("=" * 70)
    
    successful_results = [r for r in results if r['success']]
    
    if successful_results:
        total_processing_time = sum(r['processing_time'] for r in successful_results)
        avg_processing_time = total_processing_time / len(successful_results)
        total_file_size = sum(r['file_size_mb'] for r in successful_results)
        total_population = sum(r['total_population'] for r in successful_results)
        
        print(f"✅ Successful: {successful}/{len(assets)} assets ({successful/len(assets)*100:.1f}%)")
        print(f"❌ Failed: {failed}/{len(assets)} assets")
        print()
        print(f"⏱️  Total wall time: {overall_time:.1f} seconds ({overall_time/60:.1f} minutes)")
        print(f"⏱️  Total processing time: {total_processing_time:.1f} seconds")
        print(f"⚡ Average per asset: {avg_processing_time:.2f} seconds")
        print(f"🚀 Speedup from parallelism: {total_processing_time/overall_time:.1f}x")
        print()
        print(f"💾 Total output size: {total_file_size:.1f} MB")
        print(f"💾 Average file size: {total_file_size/len(successful_results):.1f} MB")
        print(f"👥 Total population analyzed: {total_population:,.0f} people")
        print()
        
        # Show performance comparison with old pipeline (estimated)
        estimated_old_time = len(assets) * 5.3  # seconds per asset from our earlier estimate
        speedup = estimated_old_time / overall_time
        
        print(f"🎯 PERFORMANCE COMPARISON:")
        print(f"   Old 5-step pipeline (estimated): {estimated_old_time/60:.1f} minutes")
        print(f"   New unified pipeline (actual): {overall_time/60:.1f} minutes")
        print(f"   Performance improvement: {speedup:.1f}x faster")
    
    # Step 5: Update assets.json with new overlay references
    update_assets_metadata(results)
    
    return {
        'total_assets': len(assets),
        'successful': successful,
        'failed': failed,
        'overall_time': overall_time,
        'total_file_size_mb': total_file_size if successful_results else 0,
        'backup_dir': backup_dir,
        'results': results
    }

def update_assets_metadata(results):
    """Update assets.json with new overlay file references"""
    
    print("📝 Updating assets.json metadata...")
    
    # Load current assets.json
    with open('assets.json', 'r') as f:
        assets_data = json.load(f)
    
    # Create lookup for successful results
    result_lookup = {}
    for result in results:
        if result['success']:
            key = f"{result['country']}_{result['asset_id']}"
            result_lookup[key] = result
    
    # Update asset metadata
    updated_count = 0
    for asset in assets_data['assets']:
        key = f"{asset['country']}_{asset['asset_id']}"
        
        if key in result_lookup:
            result = result_lookup[key]
            
            # Add new overlay reference
            asset['overlay_file'] = f"{asset['country']}_{asset['asset_id']}_data.json"
            
            # Update processing metadata
            asset['processing'] = {
                'pipeline_version': 'unified_v3.0_risk_buckets',
                'processed_date': datetime.now().isoformat(),
                'processing_time_seconds': result['processing_time'],
                'file_size_mb': result['file_size_mb']
            }
            
            updated_count += 1
    
    # Update global metadata
    assets_data['metadata']['pipeline_version'] = 'unified_v3.0_risk_buckets'
    assets_data['metadata']['last_processed'] = datetime.now().isoformat()
    assets_data['metadata']['overlay_format'] = 'unified_json_with_risk_buckets'
    
    # Save updated assets.json
    with open('assets.json', 'w') as f:
        json.dump(assets_data, f, indent=2)
    
    print(f"✅ Updated metadata for {updated_count} assets in assets.json")

if __name__ == "__main__":
    summary = process_full_dataset(max_workers=6)
    
    print("\n" + "🎉" * 20)
    print("FULL DATASET PROCESSING COMPLETE!")
    print("🎉" * 20)
    print(f"Processed {summary['successful']}/{summary['total_assets']} assets successfully")
    print(f"Total time: {summary['overall_time']:.1f} seconds")
    print(f"Output directory: overlays/")
    print(f"Backup directory: {summary['backup_dir']}")
    print(f"Total output size: {summary['total_file_size_mb']:.1f} MB")