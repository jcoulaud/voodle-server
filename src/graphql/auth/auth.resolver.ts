import { CurrentUser } from '@/decorators/current-user.decorator';
import { Public } from '@/decorators/public.decorator';
import { User } from '@/graphql/users/models/user.model';
import { JwtAuthGuard } from '@/guards/jwt-auth.guard';
import { AuthService } from '@/services/auth/auth.service';
import { Logger, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthResult, AuthResultBase } from './models/auth-result.model';

interface GraphQLContext {
  res: {
    cookie: (name: string, value: string, options?: any) => void;
    clearCookie: (name: string, options?: any) => void;
  };
  req: {
    cookies: { [key: string]: string };
  };
}

@Resolver()
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(private authService: AuthService) {}

  @Query(() => User)
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Mutation(() => AuthResult)
  @Public()
  async sendMagicLink(@Args('email') email: string): Promise<typeof AuthResult> {
    await this.authService.sendMagicLink(email);
    return { success: true, message: 'Magic link sent successfully' };
  }

  @Mutation(() => AuthResult)
  @Public()
  async verifyMagicLink(
    @Args('token') token: string,
    @Args('email') email: string,
    @Context() context: GraphQLContext,
  ): Promise<typeof AuthResult> {
    try {
      const result = await this.authService.verifyMagicLink(token, email);
      this.setTokenCookies(context.res, result.accessToken, result.refreshToken);

      if (result.mnemonic) {
        return {
          success: true,
          message: 'Authentication successful',
          mnemonic: result.mnemonic,
        };
      }

      return {
        success: true,
        message: 'Authentication successful',
      };
    } catch (error) {
      this.logger.error(`Could not verify magic link: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Could not verify magic link.',
      };
    }
  }

  @Mutation(() => AuthResultBase)
  @Public()
  async refreshToken(@Context() context: GraphQLContext): Promise<AuthResultBase> {
    try {
      const refreshToken = context.req.cookies['refreshToken'];
      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token provided');
      }

      const { accessToken, refreshToken: newRefreshToken } = await this.authService.refreshToken(
        refreshToken,
      );
      this.setTokenCookies(context.res, accessToken, newRefreshToken);
      return { success: true, message: 'Token refreshed successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Mutation(() => AuthResultBase)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: User,
    @Context() context: GraphQLContext,
  ): Promise<AuthResultBase> {
    await this.authService.logout(user.id);
    this.clearTokenCookies(context.res);
    return { success: true, message: 'Logged out successfully' };
  }

  private setTokenCookies(
    res: GraphQLContext['res'],
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearTokenCookies(res: GraphQLContext['res']): void {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
  }
}
