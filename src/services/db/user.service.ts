import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '../../db/schema';
import { User } from '../../types';

@Injectable()
export class UserService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async createUser(email: string): Promise<User> {
    try {
      const [newUser] = await this.db
        .insert(users)
        .values({
          email,
          username: email.split('@')[0],
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning();

      if (!newUser) {
        throw new Error('Failed to create user');
      }

      const user: User = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        emailVerified: newUser.emailVerified,
        createdAt: newUser.created_at || new Date(),
        updatedAt: newUser.updated_at || new Date(),
      };

      return user;
    } catch (error) {
      console.error(`Error creating user with email ${email}:`, error);
      throw error;
    }
  }

  async editUser(userId: number, updateData: Partial<User>): Promise<User | null> {
    try {
      const { id, ...dataToUpdate } = updateData;

      const [updatedUser] = await this.db
        .update(users)
        .set({
          ...dataToUpdate,
          updated_at: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return null;
      }

      return {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        createdAt: updatedUser.created_at || new Date(),
        updatedAt: updatedUser.updated_at || new Date(),
      };
    } catch (error) {
      console.error(`Error updating user with id ${userId}:`, error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!user) return null;

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.created_at || new Date(),
        updatedAt: user.updated_at || new Date(),
      };
    } catch (error) {
      console.error(`Error fetching user by email ${email}:`, error);
      throw error;
    }
  }

  async findUserById(userId: number): Promise<User | null> {
    try {
      const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) return null;

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.created_at || new Date(),
        updatedAt: user.updated_at || new Date(),
      };
    } catch (error) {
      console.error(`Error fetching user by id ${userId}:`, error);
      throw error;
    }
  }
}
