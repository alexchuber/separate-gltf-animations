
import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { prune, quantize, reorder, resample, weld, simplify, dedup } from '@gltf-transform/functions';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { AnimationTargetPatcher } from './extensions/animationTargetPatcher.js';
import { meshoptCompress } from './transforms/meshoptCompress.js';
import { copyAnimations } from './transforms/copyAnimations.js';
import { filterAnimations } from './transforms/filterAnimations.js';

async function applyPreProcessing(doc: Document) {
    return doc.transform(
        // Start with a clean source document
        prune(),
    );
}

async function applyPostProcessing(doc: Document) {
    return doc.transform(
        // Begin gltfpack-like processing steps
        weld(),
        simplify({
            simplifier: MeshoptSimplifier,
            ratio: 1, 
            error: 0.01,
            // cleanup: false,
        }),
        resample({
            cleanup: false,
        }),
        reorder({
            encoder: MeshoptEncoder, 
            target: 'size',
            cleanup: false,
        }),
        quantize({
            pattern: /^(?!(?:POSITION|TEX_COORD)$).+/, // Same as -vpf and -vtf
            quantizePosition: 14,
            quantizeNormal: 8,
            quantizeTexcoord: 12,
            quantizeColor: 8,
            quantizeWeight: 8,
            quantizeGeneric: 12,
            normalizeWeights: true,
            cleanup: false
        }),
        meshoptCompress({
            method: EXTMeshoptCompression.EncoderMethod.FILTER, // Same as -cc
        }),

        // Insert more transforms here as needed
        
        // Begin cleanup here, on our own terms, because the above transforms may try to remove "unreferenced" animations that we want to keep
        prune({
            propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.ANIMATION_SAMPLER],
        }),
        dedup({
            keepUniqueNames: true,
        }),
    );
}

async function writeDoc(io: NodeIO, document: Document, outputPath: string, fileName: string) {
    let joinedOutputPath = outputPath;
    if (CONFIG.outputSeparateFolders) {
        joinedOutputPath = path.join(joinedOutputPath, fileName);
    }
    fs.mkdirSync(joinedOutputPath, { recursive: true });
    joinedOutputPath = path.join(joinedOutputPath, `${fileName}.${CONFIG.outputGlb ? 'glb' : 'gltf'}`);

    await io.write(joinedOutputPath, document);
}

async function main() {
    // Read and prepare source file
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;

    const io = new NodeIO()
        .registerExtensions([...ALL_EXTENSIONS, AnimationTargetPatcher])
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

    const srcDoc = await io.read(CONFIG.inputFile);

    applyPreProcessing(srcDoc);

    // Animation-only documents
    for (const [name, pattern] of Object.entries(CONFIG.animationMap)) {
        if (name === "Base") continue;

        const doc = new Document();
        await doc.transform(
            copyAnimations({
                source: srcDoc,
                pattern,
            }),
        );
        await applyPostProcessing(doc);
        await writeDoc(io, doc, CONFIG.outputPath, name);
    }

    // Base model document
    await srcDoc.transform(
        filterAnimations({ pattern: CONFIG.animationMap.Base }),
    );
    await applyPostProcessing(srcDoc);
    await writeDoc(io, srcDoc, CONFIG.outputPath, path.basename(CONFIG.inputFile, path.extname(CONFIG.inputFile)));
}


try {
    console.log(`Transforming GLTF...\n`);
    await main();
    console.log("\nGLTF transformation complete.");
} catch (error) {
    console.error("An error occurred during the transformation process:", error);
    process.exit(1);
}
