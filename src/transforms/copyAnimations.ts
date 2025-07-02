
import { Animation, Document, Node, Transform } from "@gltf-transform/core";
import { copyToDocument, createDefaultPropertyResolver, createTransform } from "@gltf-transform/functions";
import { AnimationTargetPatcher } from "../extensions/animationTargetPatcher.js";

/**
 * Copy animations from one document to another based on a specified pattern
 */
export function copyAnimations(options: { source: Document, pattern: string | string[] }): Transform {
    return createTransform('copyAnimations', async (document: Document): Promise<void> => {
        let pattern = options.pattern;
        if (Array.isArray(pattern)) {
            pattern = "^(" + pattern.join('|') + ")$"
        }
        const regex = new RegExp(pattern || /a^/);

        const allNodes = options.source.getRoot().listNodes();
        const allAnimations = options.source.getRoot().listAnimations();
        const animationsToCopy = allAnimations.filter(anim => regex.test(anim.getName() || ''));

        // Get node indices before copying animations
        const animationNodeMap = buildAnimationNodeMap(allNodes, animationsToCopy);

        // Temporarily clear animation targets from source to avoid unintentionally copying over node dependencies
        for (const animation of animationsToCopy) {
            animation.listChannels().forEach(channel => {
                channel.setTargetNode(null);
            });
        }

        // Copy animations to the new document
        const resolver = createDefaultPropertyResolver(document, options.source);
        copyToDocument(document, options.source, animationsToCopy, resolver);

        // Restore animation targets in the source, just in case they're needed later
        animationsToCopy.forEach(animation => {
            animation.listChannels().forEach((channel, index) => {
                const targetNodeIndex = animationNodeMap.get(animation.getName())?.get(index);
                if (targetNodeIndex !== undefined) {
                    const targetNode = allNodes[targetNodeIndex];
                    channel.setTargetNode(targetNode);
                }
            });
        });

        // Add an extension that'll handle node target reconstruction during JSON writing
        document.createExtension(AnimationTargetPatcher)
            .setAnimationTargetMap(animationNodeMap);
    });
}

function buildAnimationNodeMap(sourceNodeList: Node[], animations?: Animation[]): Map<string, Map<number, number>> {
    const animationNodeMap = new Map<string, Map<number, number>>();
    
    animations?.forEach(animation => {
        const animName = animation.getName();
        if (!animName) return;

        const channelMap = new Map<number, number>();
        animation.listChannels().forEach((channel, index) => {
            const targetNode = channel.getTargetNode();

            if (targetNode) {
                const nodeIndex = sourceNodeList.indexOf(targetNode);
                if (nodeIndex !== -1) {
                    channelMap.set(index, nodeIndex);
                }
            }
        });
        
        if (channelMap.size > 0) {
            animationNodeMap.set(animName, channelMap);
        }
    });

    return animationNodeMap;
}