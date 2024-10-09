import { magicLinkEmail } from '@/emails';
import { RefreshTokenService } from '@/services/db/refresh-token.service';
import { UserService } from '@/services/db/user.service';
import { VerificationTokenService } from '@/services/db/verification-token.service';
import { User } from '@/types';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AuthService {
  private resend: Resend;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private verificationTokenService: VerificationTokenService,
    private userService: UserService,
    private refreshTokenService: RefreshTokenService,
    private walletService: WalletService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async sendMagicLink(email: string): Promise<void> {
    const token = this.generateToken();
    const expirationTime = Date.now() + 15 * 60 * 1000; // 15 minutes

    await this.verificationTokenService.generateVerificationToken(
      email,
      token,
      new Date(expirationTime),
    );

    const magicLink = `${this.configService.get<string>(
      'BASE_URL',
    )}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await this.resend.emails.send({
        from: 'Voodle <noreply@voodle.io>',
        to: email,
        subject: 'Your Magic Link',
        html: magicLinkEmail(magicLink, this.configService.get<string>('BASE_URL')),
      });
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send magic link email');
    }
  }

  async verifyMagicLink(
    token: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string; mnemonic?: string }> {
    try {
      const isValid = await this.verificationTokenService.validateAndUpdateToken(email, token);
      if (isValid) {
        let user = await this.userService.getUserByEmail(email);
        let mnemonic: string | undefined;

        if (!user) {
          const newUser = await this.userService.createUser(email);
          user = newUser;
          mnemonic = await this.walletService.createTonWallet(user.id);
        }

        await this.userService.editUser(user.id, { emailVerified: new Date() });
        const tokens = await this.generateTokens(user);

        return mnemonic ? { ...tokens, mnemonic } : tokens;
      } else {
        throw new UnauthorizedException('Invalid or expired token');
      }
    } catch (error) {
      this.logger.error(`Error verifying magic link: ${error.message}`, error.stack);
      throw new UnauthorizedException('Authentication failed.');
    }
  }

  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateJwt(user);
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await this.refreshTokenService.createRefreshToken(user.id, refreshToken, 7 * 24 * 60 * 60); // 7 days

    return { accessToken, refreshToken };
  }

  async refreshToken(
    oldRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const storedToken = await this.refreshTokenService.findRefreshToken(oldRefreshToken);

    if (!storedToken || storedToken.expires < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userService.findUserById(storedToken.userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.refreshTokenService.deleteRefreshToken(oldRefreshToken);

    return this.generateTokens(user);
  }

  async logout(userId: number): Promise<void> {
    await this.refreshTokenService.deleteAllUserRefreshTokens(userId);
  }

  generateJwt(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
  }

  generateRefreshToken(user: User): string {
    const payload = { sub: user.id, type: 'refresh' };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
