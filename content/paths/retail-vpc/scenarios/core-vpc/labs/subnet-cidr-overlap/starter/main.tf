resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_internet_gateway" "retail" {
  vpc_id = aws_vpc.retail.id

  tags = {
    Name = "retaildemostore-igw"
  }
}

resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true

  tags = {
    Name = "retaildemostore-public-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = true

  tags = {
    Name = "retaildemostore-public-2"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = false

  tags = {
    Name = "retaildemostore-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.3.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = false

  tags = {
    Name = "retaildemostore-private-2"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.retail.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.retail.id
  }

  tags = {
    Name = "retaildemostore-public-rt"
  }
}

resource "aws_route_table_association" "public_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}
