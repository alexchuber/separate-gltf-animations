import { Accessor, Animation, Document, Property, PropertyType } from '@gltf-transform/core';
import { Extension, WriterContext } from '@gltf-transform/core';
import { copyToDocument, createDefaultPropertyResolver } from '@gltf-transform/functions';
import { disposeAnimations } from './removeAnimations.js';

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

export class AnimationSeparator {
    private sourceDoc: Document;
    private animationMap: Record<string, string | string[]>;

    constructor(sourceDoc: Document, animationMap: Record<string, string | string[]>) {
        this.sourceDoc = sourceDoc;
        this.animationMap = animationMap;
    }

    async separate(): Promise<{ baseDoc: Document; chunkDocs: Map<string, Document> }> {
        // 1. Group animations by chunk patterns
        const { chunkMap, baseAnimations, unmatchedAnimations } = this.categorizeAnimations();

        // 2. Cull unused animations from the source document
        this.sourceDoc.transform(
            disposeAnimations({
                animations: unmatchedAnimations
            })
        );
        
        // 2. Cache target node indices before clearing them
        AnimationTargetPatcher.AnimationTargetMap = buildAnimationNodeMap(this.sourceDoc);
        
        // 3. Create chunk documents and copy animations
        const chunkDocuments = this.createChunkDocuments(chunkMap);

        // 4. Remove all animations, apart from base animations, from the source document
        const animationsToDispose = this.sourceDoc.getRoot().listAnimations().filter(anim => !baseAnimations.includes(anim));
        this.sourceDoc.transform(
            disposeAnimations({
                animations: animationsToDispose
            })
        );

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

// Build a map of animation names -> channels, and channel -> target node index
export function buildAnimationNodeMap(srcDoc: Document): Map<string, Map<number, number>> {
    const animationNodeMap = new Map<string, Map<number, number>>();
    const allNodes = srcDoc.getRoot().listNodes();
    
    srcDoc.getRoot().listAnimations().forEach(animation => {
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
            animationNodeMap.set(animName, channelMap);
        }
    });

    return animationNodeMap;
}