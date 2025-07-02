import { Accessor, Animation, Document, Property, PropertyType, Transform } from "@gltf-transform/core";
import { createTransform } from "@gltf-transform/functions";

/**
 * Keep only specified animations and remove others
 */
export function filterAnimations(options: { pattern: string | string[] }): Transform {
    return createTransform('filterAnimations', async (document: Document): Promise<void> => {
        let pattern = options.pattern;
        if (Array.isArray(pattern)) {
            pattern = "^(" + pattern.join('|') + ")$"
        }
        const regex = new RegExp(pattern || /a^/);

        const allAnimations = document.getRoot().listAnimations();
        const animationsToRemove = allAnimations.filter(anim => !regex.test(anim.getName() || ''));
        removeAnimationsAndData(animationsToRemove);
    });
}

function removeAnimationsAndData(animations: Animation[]) {
    const referencedAccessors = new Set<Accessor>();
    const referencedSamplers = new Set<Property>();

    // Collect all accessors referenced by animations to remove
    animations.forEach(anim => {
        anim.listSamplers().forEach(sampler => {
            referencedSamplers.add(sampler);
            const input = sampler.getInput();
            const output = sampler.getOutput();
            if (input) referencedAccessors.add(input);
            if (output) referencedAccessors.add(output);
        });
    });
    
    // Filter accessors to only remove those that are unique to these animations
    const accessorsToCull = Array.from(referencedAccessors).filter(accessor => 
        accessor.listParents().every(parent => 
            parent.propertyType === PropertyType.ROOT || referencedSamplers.has(parent)
        )
    );

    // Dispose of animations and their unique accessors
    accessorsToCull.forEach(accessor => accessor.dispose());
    animations.forEach(animation => animation.dispose());
}