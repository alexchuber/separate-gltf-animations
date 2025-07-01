
import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { prune, quantize, reorder, resample, weld, simplify, dedup } from '@gltf-transform/functions';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import fs from 'fs';
import path from 'path';
import { CONFIG, AnimationSeparatorConfig } from './config.js';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { AnimationSeparator, AnimationTargetPatcher } from './separate-animations.js';


async function writeDoc(io: NodeIO, document: Document, outputPath: string, fileName: string, config: AnimationSeparatorConfig) {
    let joinedOutputPath = outputPath;
    if (config.outputSeparateFolders) {
        joinedOutputPath = path.join(joinedOutputPath, fileName);
    }
    fs.mkdirSync(joinedOutputPath, { recursive: true });
    joinedOutputPath = path.join(joinedOutputPath, `${fileName}.${config.outputGlb ? 'glb' : 'gltf'}`);

    await io.write(joinedOutputPath, document);
}

async function transformGltf(inputPath: string, outputPath: string, chunkMap: Record<string, string | string[]>, config: AnimationSeparatorConfig) {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;

    const io = new NodeIO()
        .registerExtensions([...ALL_EXTENSIONS, AnimationTargetPatcher])
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });


    const srcDoc = await io.read(inputPath);

    // // Remove accessories
    // srcDoc.getRoot().listNodes().forEach(node => {
    //     const name = node.getName();
    //     if (name && config.accessories.some(accessory => new RegExp(accessory, 'i').test(name))) {
    //         console.log(`Removing accessory node: ${name}`);
    //         node.dispose();
    //     }
    // });
    // // Prune
    // srcDoc.transform(prune());
    
    // Separate animations
    const separator = new AnimationSeparator(srcDoc, chunkMap);
    const { baseDoc, chunkDocs } = await separator.separate();

    // Optimize
    for (const doc of [baseDoc, ...chunkDocs.values()]) {
        await doc.transform(
            weld(),
            simplify({
                simplifier: MeshoptSimplifier,
                ratio: 1, 
                error: 0.01
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
            prune({
                propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.ANIMATION_SAMPLER],
            }),
            dedup({
                keepUniqueNames: true,
            }),
        );

        
        doc
            .createExtension(EXTMeshoptCompression) 
            .setRequired(true)
            .setEncoderOptions({
                method: EXTMeshoptCompression.EncoderMethod.FILTER, // Same as -cc
            });
    }

    // Write the base document (model without extracted animations)
    await writeDoc(io, baseDoc, outputPath, path.basename(inputPath, path.extname(inputPath)), config);

    // Write each animation chunk
    for (const [name, doc] of chunkDocs) {
        await writeDoc(io, doc, outputPath, name, config);
    }
}


async function main() {
    try {
        console.log(`Transforming GLTF...\n`);
        await transformGltf(CONFIG.inputFile, CONFIG.outputPath, CONFIG.animationMap, CONFIG);
        console.log("\nGLTF transformation complete.");
    } catch (error) {
        console.error("An error occurred during the transformation process:", error);
        process.exit(1);
    }
}

main();
