import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	UseGuards,
	Req,
	Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAccessTokenGuard } from '../auth/guards/jwt-access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from 'src/decorators/auth.decorator';
import { ForbiddenException } from '@nestjs/common';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { AuthRequest } from '@modules/auth/auth.controller';


@ApiTags('users')
@ApiBearerAuth()
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

	//Update Profile
	@Patch('me/update-profile')
	@ApiOperation({ summary: 'Update user profile' })
	@UseGuards(JwtAccessTokenGuard)
	updateProfile(@Request() req: AuthRequest, @Body() updateProfileDto: UpdateUserDto) {
		return this.usersService.updateProfile(req.user.userId, updateProfileDto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update user by ID' })
	@ApiResponse({ status: 200, description: 'User updated successfully' })
	update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
		return this.usersService.update(id, updateUserDto);
	}

	@UseGuards(JwtAccessTokenGuard)
	@Delete(':id')
	@ApiBearerAuth()
	@ApiResponse({ status: 200, description: 'User deleted successfully' })
	@ApiResponse({ status: 403, description: 'Forbidden: You can only delete your own account or must be admin' })
	@ApiResponse({ status: 404, description: 'User not found' })
	async remove(@Param('id') id: string, @Body() body: any, @Req() req: any) {
		const userIdFromToken = req.user.sub;
		const userRole = req.user.role;
		if (userIdFromToken !== id && userRole !== UserRole.ADMIN) {
			throw new ForbiddenException('You can only delete your own account or must be admin');
		}
		return this.usersService.remove(id);
	}
}
