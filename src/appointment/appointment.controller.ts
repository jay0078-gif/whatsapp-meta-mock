import { Body, Controller, Post } from '@nestjs/common';

import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppointmentService } from './appointment.service';

import { CreateAppointmentDto } from './dto/create-appointment.dto';

import { AppointmentResponseDto } from './dto/appointment-response.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @ApiOperation({
    summary: 'Create appointment and send WhatsApp message',
  })
  @ApiBody({
    type: CreateAppointmentDto,
  })
  async create(
    @Body() body: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentService.createAppointment(body);
  }
}
