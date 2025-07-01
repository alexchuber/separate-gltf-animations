import { Accessor, Animation, Document, Property, PropertyType } from "@gltf-transform/core";
import { Transform } from "@gltf-transform/core";
import { createTransform } from "@gltf-transform/functions";

const NAME = 'dispose-animations';

export function disposeAnimations(options: { animations: Animation[] }): Transform {
    return createTransform(NAME, async (document: Document): Promise<void> => {
        const referencedAccessors = new Set<Accessor>();
        const referencedSamplers = new Set<Property>();

        // Collect all accessors referenced by unused animations
        options.animations.forEach(anim => {
            anim.listSamplers().forEach(sampler => {
                referencedSamplers.add(sampler);
                const input = sampler.getInput();
                const output = sampler.getOutput();
                if (input) referencedAccessors.add(input);
                if (output) referencedAccessors.add(output);
            });
        });
        
        // Filter list of accessors to cull, so we don't remove accessors that are shared with other things
        const accessorsToCull = Array.from(referencedAccessors).filter(accessor => 
            accessor.listParents().every(parent => parent.propertyType == PropertyType.ROOT || referencedSamplers.has(parent) )
        );

        // Finally, dispose of the unused animations, their unique accessors, and their buffer data
        accessorsToCull.forEach(accessor => {
            accessor.dispose();
        });
        options.animations.forEach(animation => {
            animation.dispose();
        });
    });
}