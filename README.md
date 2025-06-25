# glTF Animation Separator

A sample script demonstrating how to break up a glTF with animations into different logical pieces: one base model glTF containing the scene hierarchy, geometry, materials, and textures, plus separate animation-only glTF files. These separated files require custom loading logic to be properly used together - see https://playground.babylonjs.com/#KOXM7J#3 for an example implementation.

## Quick Start

Requirements
- Node.js
- npm

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your settings:**
   Edit `src/config.ts` to set your input file, output directory, and animation name matchers:

   ```typescript
   export const CONFIG: AnimationSeparatorConfig = {
       inputFile: 'inputs/YourModel.glb',
       outputPath: 'outputs',
       outputGlb: true,
       outputSeparateFolders: false,
       animationMap: {
           "Base": [
            "Walk",
            "Idle"
           ]
           "Combat": [
            "Attack",
            "Strike"
           ],
           "Movement": "^(Walk|Run)",
       }
   };
   ```

3. **Run the separator:**
   ```bash
   npm start
   ```

## Inputs

Modify `src/config.ts` to change input/output paths and animation mapping patterns

- **`inputFile`**: Path to the input glTF or GLB file
   - Animations must use node targets (no animation pointers) and have unique names
- **`outputPath`**: Path to the target output directory
- **`outputGlb`**: `true` to output `.glb` formats, `false` for `.gltf`
- **`outputSeparateFolders`**: `true` to create separate folders for each output file
- **`animationMap`**: Map of desired animation namespaces to animation names in the source glTF
   - Animation names can be specified either by regex or whitelist.
   - Specify a "Base" namespace to include animations in the base model output

## Outputs

- **Base Model glTF**: Your original model with the scene hierarchy, geometry, materials, textures, and any animations matched by the "Base" key in `animationMap`
- **Animation-only glTFs**: Individual files containing only animations and their binary data
  - ⚠️ These are intentionally invalid glTF files (no scene, no nodes)  
  - Designed for custom loading systems that merge with the base model's node hierarchy

## Technical Details

### Using the outputs
The animation chunks reference node indices that don't exist in the chunk files themselves. This is intentional - they're designed to be loaded alongside the base model by custom loading code that can reconcile the node references.

### Processing Pipeline
1. Groups animations by matching names against regex patterns or lists
2. Caches original node target indices for later reconstruction
3. Uses AnimationTargetPatcher extension to access JSON and manipulate its node references
