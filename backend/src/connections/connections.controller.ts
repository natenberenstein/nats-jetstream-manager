import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConnectionsService } from './connections.service';
import { ConnectionRequestDto } from './dto/connection.dto';

@ApiTags('Connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  listConnections() {
    return this.connectionsService.listConnections();
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  testConnection(@Body() dto: ConnectionRequestDto) {
    return this.connectionsService.testConnection(dto.url, dto.user, dto.password, dto.token);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  createConnection(@Body() dto: ConnectionRequestDto) {
    return this.connectionsService.createConnection(dto.url, dto.user, dto.password, dto.token);
  }

  @Get(':id/status')
  getConnectionStatus(@Param('id') id: string) {
    return this.connectionsService.getConnectionStatus(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeConnection(@Param('id') id: string) {
    await this.connectionsService.removeConnection(id);
  }
}
