import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	UseGuards,
	Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { JwtAccessTokenGuard } from '@modules/auth/guards/jwt-access-token.guard';
import { AuthRequest } from '@modules/auth/auth.controller';


@ApiTags('users')
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) { }

	@Post()
	@ApiOperation({ summary: 'Create a new user' })
	@ApiResponse({ status: 201, description: 'User created successfully' })
	create(@Body() createUserDto: CreateUserDto) {
		return this.usersService.create(createUserDto);
	}

	@Get()
	@ApiOperation({ summary: 'Get all users' })
	@ApiResponse({ status: 200, description: 'List of users' })
	findAll() {
		return this.usersService.findAll();
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get user by ID' })
	@ApiResponse({ status: 200, description: 'User found' })
	findOne(@Param('id') id: string) {
		return this.usersService.findOne(id);
	}

	//Change password API
	@Patch('me/change-password')
	@ApiOperation({ summary: 'Change user password' })
	@UseGuards(JwtAccessTokenGuard)
	changePassword(@Request() req: AuthRequest, @Body() changePasswordDto: ChangePasswordDTO) {
		return this.usersService.changePassword(req.user.userId, changePasswordDto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update user by ID' })
	@ApiResponse({ status: 200, description: 'User updated successfully' })
	update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
		return this.usersService.update(id, updateUserDto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete user by ID' })
	@ApiResponse({ status: 200, description: 'User deleted successfully' })
	remove(@Param('id') id: string) {
		return this.usersService.remove(id);
	}
}
