declare module "html-to-text" {
    type CompiledConverter = (
        html: string,
        metadata?: { baseUrl: string },
    ) => string

    export function compile(options: unknown): CompiledConverter
}
