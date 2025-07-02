/**
 * Configuration for the glTF animation separator script
 */
export const CONFIG = {
  /** Path to the input glTF or GLB file */
  inputFile: "inputs/MorphStressTest.glb",

  /** Directory where output files will be saved */
  outputPath: "output/MorphStressTest",

  /** Whether to output in GLB format (true) or glTF format (false) */
  outputGlb: true,

  /** Whether to save each output file in its own folder */
  outputSeparateFolders: true,

  /** Animation name patterns mapped to output filenames, represented either as list or regex */
  /** Use the key 'Base' to specify animations to have in base model file */
  animationMap: {
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
};