declare module "s3rver" {
    export interface S3rverBucketConfig {
        name: string;
    }

    export interface S3rverOptions {
        port: number;
        address: string;
        silent?: boolean;
        directory: string;
        configureBuckets?: S3rverBucketConfig[];
    }

    export default class S3rver {
        constructor(options: S3rverOptions);
        run(callback: (err?: Error | null) => void): void;
        close(callback: () => void): void;
    }
}
