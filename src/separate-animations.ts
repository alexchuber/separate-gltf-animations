import { Accessor, Animation, Document, NodeIO, Property, PropertyType } from '@gltf-transform/core';
import { Extension, WriterContext } from '@gltf-transform/core';
import { copyToDocument, createDefaultPropertyResolver, partition } from '@gltf-transform/functions';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
import path from 'path';
import { CONFIG, AnimationSeparatorConfig } from './config.js';

export class AnimationTargetPatcher extends Extension {
	static EXTENSION_NAME = 'AnimationTargetPatcher';
    extensionName = 'AnimationTargetPatcher';
    
    public static AnimationTargetMap: Map<string, Map<number, number>> | undefined;

	public read(): this {
        throw new Error('Not implemented');
    }

	public write(context: WriterContext): this {
        if (!AnimationTargetPatcher.AnimationTargetMap) {
            throw new Error('No AnimationTargetMap found.');
        }
                
        this.document.getRoot().listAnimations().forEach((animation, i) => {
            const channelTargetMap = AnimationTargetPatcher.AnimationTargetMap!.get(animation.getName());
            if (!channelTargetMap) {
                return;
            }

            const animationJson = context.jsonDoc.json.animations?.[i];
            if (!animationJson) {
                return;
            }

            for (const [channelIndex, targetNodeIndex] of channelTargetMap.entries()) {   
                const channelJSON = animationJson.channels[channelIndex];
                channelJSON.target.node = targetNodeIndex;
            }
        });
        
        // Remove this extension from the extensions used 
        context.jsonDoc.json.extensionsUsed = context.jsonDoc.json.extensionsUsed?.filter((ext) => ext !== this.extensionName);

		return this;
	}
}

class AnimationSeparator {
    private sourceDoc: Document;
    private animationMap: Record<string, string | string[]>;
    private targetCache = new Map<string, Map<number, number>>();

    constructor(sourceDoc: Document, animationMap: Record<string, string | string[]>) {
        this.sourceDoc = sourceDoc;
        this.animationMap = animationMap;
    }

    async separate(): Promise<{ baseDoc: Document; chunkDocs: Map<string, Document> }> {
        // 1. Group animations by chunk patterns
        const { chunkMap, baseAnimations, unmatchedAnimations } = this.categorizeAnimations();
        const chunkAnimations = Array.from(new Set(Array.from(chunkMap.values()).flat()));

        // 2. Cull unused animations from the source document
        this.disposeAnimations(unmatchedAnimations);
        
        // 2. Cache target node indices before clearing them
        this.cacheTargetIndices(chunkAnimations);
        
        // 3. Create chunk documents and copy animations
        const chunkDocuments = this.createChunkDocuments(chunkMap);

        // 4. Remove all animations, apart from base animations, from the source document
        const animationsToDispose = this.sourceDoc.getRoot().listAnimations().filter(anim => !baseAnimations.includes(anim));
        this.disposeAnimations(animationsToDispose);

        // 5. Give each doc the AnimationTargetPatcher extension
        this.sourceDoc.createExtension(AnimationTargetPatcher);
        chunkDocuments.forEach(doc => {
            doc.createExtension(AnimationTargetPatcher);
        });
        
        return {
            baseDoc: this.sourceDoc,
            chunkDocs: chunkDocuments
        };
    }

    private disposeAnimations(unusedAnimations: Animation[]): void {
        const referencedAccessors = new Set<Accessor>();
        const referencedSamplers = new Set<Property>();

        // Collect all accessors referenced by unused animations
        unusedAnimations.forEach(anim => {
            anim.listSamplers().forEach(sampler => {
                referencedSamplers.add(sampler);
                const input = sampler.getInput();
                const output = sampler.getOutput();
                if (input) referencedAccessors.add(input);
                if (output) referencedAccessors.add(output);
            });
        });
        
        // Filter list of accessors to cull, so we don't remove accessors that are shared with kept animations
        const accessorsToCull = Array.from(referencedAccessors).filter(accessor => 
            accessor.listParents().every(parent => parent.propertyType == PropertyType.ROOT || referencedSamplers.has(parent) )
        );

        // Finally, dispose of the unused animations, their unique accessors, and their buffer data
        accessorsToCull.forEach(accessor => {
            accessor.dispose();
        });
        unusedAnimations.forEach(animation => {
            animation.dispose();
        });
    }

    private categorizeAnimations(): { chunkMap: Map<string, Animation[]>; baseAnimations: Animation[]; unmatchedAnimations: Animation[] } {
        const allAnimations = this.sourceDoc.getRoot().listAnimations();
        const chunkMap = new Map<string, Animation[]>();
        const baseAnimations: Animation[] = [];
        const unmatchedAnimations: Animation[] = [];

        // Iterate over each animation and categorize it
        for (const animation of allAnimations) {
            const animName = animation.getName();
            if (!animName) continue;

            let matched = false;

            // Check each chunk pattern
            for (const [chunkName, pattern] of Object.entries(this.animationMap)) {
                let isMatch = false;

                if (typeof pattern === 'string') {
                    const regex = new RegExp(pattern);
                    isMatch = regex.test(animName);
                } else {
                    const animationNames = new Set(pattern);
                    isMatch = animationNames.has(animName);
                }

                if (isMatch) {
                    if (chunkName === "Base") {
                        baseAnimations.push(animation);
                    } else {
                        const existingChunk = chunkMap.get(chunkName) ?? [];
                        existingChunk.push(animation);
                        chunkMap.set(chunkName, existingChunk);
                    }
                    matched = true;
                    // Note: Don't break here as one animation can belong to multiple chunks
                }
            }

            // If no patterns matched, add to unmatched
            if (!matched) {
                unmatchedAnimations.push(animation);
            }
        }

        if (unmatchedAnimations.length > 0) {
            console.warn(`Removing animations with no pattern matches: ${unmatchedAnimations.map(anim => anim.getName()).join(', ')}`);
        }

        return {
            chunkMap: chunkMap,
            baseAnimations: baseAnimations,
            unmatchedAnimations: unmatchedAnimations
        };
    }

    private cacheTargetIndices(animations: Animation[]): void {
        const allNodes = this.sourceDoc.getRoot().listNodes();
        
        animations.forEach(animation => {
            const animName = animation.getName();
            if (!animName) return;

            const channelMap = new Map<number, number>();
            animation.listChannels().forEach((channel, index) => {
                const targetNode = channel.getTargetNode();

                if (targetNode) {
                    const nodeIndex = allNodes.indexOf(targetNode);
                    if (nodeIndex !== -1) {
                        channelMap.set(index, nodeIndex);
                    }
                }

                channel.setTargetNode(null);
            });
            
            if (channelMap.size > 0) {
                this.targetCache.set(animName, channelMap);
            }
        });

        // Store in static property for the extension
        AnimationTargetPatcher.AnimationTargetMap = this.targetCache;
    }
    
    private createChunkDocuments(chunks: Map<string, Animation[]>): Map<string, Document> {
        const documents: Map<string, Document> = new Map();

        chunks.forEach((animations, name) => {
            const document = new Document();
            const resolver = createDefaultPropertyResolver(document, this.sourceDoc);
            copyToDocument(document, this.sourceDoc, animations, resolver);
            documents.set(name, document);
        });

        return documents;
    }
}

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
    const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, AnimationTargetPatcher]);
    const srcDoc = await io.read(inputPath);
    
    const separator = new AnimationSeparator(srcDoc, chunkMap);
    const { baseDoc, chunkDocs } = await separator.separate();

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
