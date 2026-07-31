declare module "s3rver" {
    export interface S3rverBucketConfig {
        name: string;
        configs?: Buffer[];
    }

    export interface S3rverOptions {
        port?: number;
        address?: string;
        silent?: boolean;
        directory?: string;
        serviceEndpoint?: string;
        resetOnClose?: boolean;
        allowMismatchedSignatures?: boolean;
        vhostBuckets?: boolean;
        configureBuckets?: S3rverBucketConfig[];
    }

    export interface S3rverAddress {
        address: string;
        family: string;
        port: number;
    }

    export default class S3rver {
        constructor(options?: S3rverOptions);
        run(callback: (err?: Error | null, address?: S3rverAddress) => void): this;
        run(): Promise<S3rverAddress>;
        close(callback: (err?: Error | null) => void): this;
        close(): Promise<void>;
    }
}
