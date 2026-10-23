-- Student Management System
-- Create Database and User

CREATE DATABASE IF NOT EXISTS student_management_system
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'student_user'@'localhost'
    IDENTIFIED BY 'student_pass';

CREATE USER IF NOT EXISTS 'student_user'@'127.0.0.1'
    IDENTIFIED BY 'student_pass';

GRANT ALL PRIVILEGES ON student_management_system.*
    TO 'student_user'@'localhost';

GRANT ALL PRIVILEGES ON student_management_system.*
    TO 'student_user'@'127.0.0.1';

    FLUSH PRIVILEGES;

USE student_management_system;

     SHOW TABLES;
