import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty } from "class-validator";

export class LockUnlockUserDto {
    @ApiProperty({
        description: "Set to true to lock the user, false to unlock",
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;
}