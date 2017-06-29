interface MrbConfig {
    /**
     * Instruct the mruby compiler how to compile .rb files
     */
    compilerOptions?: {
        /**
         * Check syntax only (Do not output .mrb file)
         */
        check_syntax_only?: boolean;

        /**
         * Turn on verbose mode (Print analysis tree and disassembles)
         */
        verbose?: boolean;

        /**
         * Generate debugging information
         */
        debug?: boolean;

        /**
         * Specifies an endian for iseq data
         */
        endian?: "little" | "big";
    };

    /**
     * Specifies a list of files or glob patterns to be excluded from compilation.
     */
    exclude?: string[];

    /**
     * Specifies a list of files or glob patterns to be included in compilation.
     */
    include?: string[];
}