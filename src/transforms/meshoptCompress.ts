import { Document, Transform } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { EncoderMethod } from "@gltf-transform/extensions/dist/ext-meshopt-compression/constants";
import { createTransform } from "@gltf-transform/functions";

/**
 * Use Meshopt compression
 */
export function meshoptCompress(options: { method: EncoderMethod }): Transform {
    return createTransform('meshoptCompress', async (document: Document): Promise<void> => {
        document
            .createExtension(EXTMeshoptCompression) 
            .setRequired(true)
            .setEncoderOptions({
                method: options.method,
            });
    });
}