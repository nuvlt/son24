#!/usr/bin/env node
// scripts/manual-cleanup.js
// Manual TTL cleanup script

require('dotenv').config();
const ttlCleanup = require('../src/services/ttlCleanup');

async function main() {
    console.log('🧹 son24saat Manual Cleanup');
    console.log('============================\n');
    
    // Preview what will be deleted
    console.log('📊 Preview (what will be deleted):');
    const preview = await ttlCleanup.preview();
    
    if (preview.totalExpired === 0) {
        console.log('✅ No expired content found. Nothing to delete.\n');
        process.exit(0);
    }
    
    console.log(`\nTotal expired posts: ${preview.totalExpired}`);
    console.log('\nBy space:');
    for (const space of preview.bySpace) {
        console.log(`  - ${space.space}: ${space.expired_posts} posts`);
    }
    
    // Ask for confirmation if not --force
    if (!process.argv.includes('--force')) {
        console.log('\n⚠️  This action is irreversible!');
        console.log('Run with --force to proceed without confirmation.\n');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            rl.question('Proceed with deletion? (yes/no): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== 'yes') {
            console.log('❌ Cancelled.');
            process.exit(0);
        }
    }
    
    // Run cleanup
    console.log('\n🗑️  Deleting expired content...');
    const result = await ttlCleanup.run();
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${result.deletedPosts} posts`);
    console.log(`   Duration: ${result.duration}ms`);
    
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
