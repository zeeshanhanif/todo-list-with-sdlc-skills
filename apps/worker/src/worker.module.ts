import { Module } from "@nestjs/common";
import { CleanupService } from "./jobs/cleanup.service";

@Module({
  providers: [CleanupService],
})
export class WorkerModule {}
