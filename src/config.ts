/**
 * Configuration for the glTF Animation Separator
 */
export interface AnimationSeparatorConfig {
  /** Path to the input glTF or GLB file */
  inputFile: string;
  /** Directory where output files will be saved */
  outputPath: string;
  /** Whether to output in GLB format (true) or glTF format (false) */
  outputGlb: boolean;
  /** Whether to save each output file in its own folder */
  outputSeparateFolders: boolean;
  /** Animation name patterns mapped to output filenames, represented either as list or regex */
  /** Use the key 'Base' to specify animations to have in base model file */
  animationMap: Record<string, string | string[]>;
}

/**
 * Default configuration - modify these values as needed
 */
export const CONFIG: AnimationSeparatorConfig = {
  inputFile: "inputs/MorphStressTest.glb",
  outputPath: "output/MorphStressTest",
  outputGlb: true,
  outputSeparateFolders: true,
  animationMap: {
    // Only these animations will remain in the base output file
    "Base": [
        "TheWave",
    ],
    // These animations will be copied to Fun.glb
    "Fun": [
        "TheWave",
        "Pulse"
    ],
    // Can use regex to match multiple animations
    "Wave": "^TheWave*",
  },
} as const;
