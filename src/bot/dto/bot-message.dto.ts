import { IsString, IsNotEmpty } from 'class-validator';

export class BotMessageDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
