import { Extension, WriterContext } from '@gltf-transform/core';

export class AnimationTargetPatcher extends Extension {
	static EXTENSION_NAME = 'AnimationTargetPatcher';
    extensionName = 'AnimationTargetPatcher';
    
    public animationTargetMap: Map<string, Map<number, number>> | undefined;

    public setAnimationTargetMap(animationTargetMap: Map<string, Map<number, number>>): this {
        this.animationTargetMap = animationTargetMap;
        return this;
    }

	public read(): this {
        throw new Error('Not implemented');
    }

	public write(context: WriterContext): this {
        if (!this.animationTargetMap) {
            throw new Error('No AnimationTargetMap found.');
        }
                
        this.document.getRoot().listAnimations().forEach((animation, i) => {
            const channelTargetMap = this.animationTargetMap!.get(animation.getName());
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
        
        // Remove this extension from the extensions used, which is done by default by the core
        context.jsonDoc.json.extensionsUsed = context.jsonDoc.json.extensionsUsed?.filter((ext) => ext !== this.extensionName);

		return this;
	}
}